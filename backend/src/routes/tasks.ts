import { Router } from "express";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb } from "../aws";
import { config } from "../config";
import { requireRole } from "../middleware/auth";
import { assertTeamMatches } from "../middleware/teamGuard";
import { assertSameOrg } from "../middleware/orgGuard";
import { asyncHandler, HttpError } from "../middleware/error";
import { Task, TaskPriority, TaskStatus, TASK_PRIORITIES, TASK_STATUSES } from "../types";
import { recordStatusChange, recordActivity } from "../services/statusLog";
import { publishTaskAssignment, emitMetric } from "../services/notifications";

const router = Router();

async function getTaskById(taskId: string): Promise<Task | undefined> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: config.tables.tasks,
      KeyConditionExpression: "taskId = :id",
      ExpressionAttributeValues: { ":id": taskId },
      Limit: 1,
    })
  );
  return (Items?.[0] as Task | undefined) ?? undefined;
}

router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const {
      projectId,
      title,
      description,
      priority,
      deadline,
      assigneeId,
      teamId,
    } = req.body ?? {};

    if (!projectId || !title || !teamId || !assigneeId) {
      throw new HttpError(400, "projectId, title, teamId, assigneeId are required");
    }
    if (priority && !TASK_PRIORITIES.includes(priority as TaskPriority)) {
      throw new HttpError(400, "Invalid priority");
    }

    // Verify the team and assignee belong to caller's org.
    const [{ Item: team }, { Item: assignee }] = await Promise.all([
      ddb.send(new GetCommand({ TableName: config.tables.teams, Key: { teamId } })),
      ddb.send(new GetCommand({ TableName: config.tables.users, Key: { userId: assigneeId } })),
    ]);
    if (!team || team.orgId !== req.user!.orgId) {
      throw new HttpError(404, "Team not found");
    }
    if (!assignee || assignee.orgId !== req.user!.orgId) {
      throw new HttpError(404, "Assignee not found");
    }

    const now = new Date().toISOString();
    const task: Task = {
      taskId: uuid(),
      projectId,
      title,
      description: description ?? "",
      status: "To Do",
      priority: (priority as TaskPriority) ?? "Medium",
      deadline: deadline ?? "",
      assigneeId,
      teamId,
      orgId: req.user!.orgId,
      createdBy: req.user!.sub,
      createdAt: now,
      updatedAt: now,
    };

    await ddb.send(new PutCommand({ TableName: config.tables.tasks, Item: task }));

    await Promise.allSettled([
      publishTaskAssignment({
        taskId: task.taskId,
        taskTitle: task.title,
        assigneeId: task.assigneeId,
        teamId: task.teamId,
        orgId: task.orgId,
        assignedBy: req.user!.sub,
      }),
      recordActivity({
        taskId: task.taskId,
        orgId: task.orgId,
        userId: req.user!.sub,
        type: "TASK_CREATED",
        payload: { title: task.title },
      }),
      emitMetric("TasksCreated", 1, { TeamId: task.teamId, OrgId: task.orgId }),
    ]);

    res.status(201).json(task);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { projectId, assigneeId } = req.query as { projectId?: string; assigneeId?: string };

    if (user.role === "manager" || user.role === "admin") {
      if (assigneeId) {
        const { Items } = await ddb.send(
          new QueryCommand({
            TableName: config.tables.tasks,
            IndexName: config.indexes.tasksAssignee,
            KeyConditionExpression: "assigneeId = :a",
            ExpressionAttributeValues: { ":a": assigneeId },
          })
        );
        return res.json(filterScope(Items ?? [], projectId, user.orgId));
      }
      const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.tasks }));
      return res.json(filterScope(Items ?? [], projectId, user.orgId));
    }

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: config.tables.tasks,
        IndexName: config.indexes.tasksTeam,
        KeyConditionExpression: "teamId = :tid",
        ExpressionAttributeValues: { ":tid": user.teamId },
      })
    );
    res.json(filterScope(Items ?? [], projectId, user.orgId));
  })
);

function filterScope(items: Record<string, unknown>[], projectId: string | undefined, orgId: string) {
  let out = items.filter((it) => it.orgId === orgId);
  if (projectId) out = out.filter((it) => it.projectId === projectId);
  return out;
}

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task || !assertSameOrg(req, task.orgId)) throw new HttpError(404, "Task not found");
    if (!assertTeamMatches(req, task.teamId)) throw new HttpError(403, "Forbidden");
    res.json(task);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task || !assertSameOrg(req, task.orgId)) throw new HttpError(404, "Task not found");

    const user = req.user!;
    const isManager = user.role === "manager" || user.role === "admin";

    if (!isManager) {
      if (user.teamId !== task.teamId) throw new HttpError(403, "Forbidden");
      const allowed = Object.keys(req.body ?? {});
      if (allowed.some((k) => k !== "status")) {
        throw new HttpError(403, "Employees may only update status");
      }
    }

    const body = req.body ?? {};
    if (body.status && !TASK_STATUSES.includes(body.status as TaskStatus)) {
      throw new HttpError(400, "Invalid status");
    }
    if (body.priority && !TASK_PRIORITIES.includes(body.priority as TaskPriority)) {
      throw new HttpError(400, "Invalid priority");
    }

    const sets: string[] = ["updatedAt = :u"];
    const values: Record<string, unknown> = { ":u": new Date().toISOString() };
    const names: Record<string, string> = {};

    const assignableFields = isManager
      ? ["title", "description", "priority", "deadline", "assigneeId", "teamId", "status"]
      : ["status"];

    for (const f of assignableFields) {
      if (body[f] !== undefined) {
        if (f === "status") {
          sets.push("#s = :status");
          names["#s"] = "status";
          values[":status"] = body[f];
        } else if (f === "description") {
          sets.push("description = :description");
          values[":description"] = body[f];
        } else {
          sets.push(`${f} = :${f}`);
          values[`:${f}`] = body[f];
        }
      }
    }

    if (sets.length === 1) throw new HttpError(400, "No fields to update");

    const { Attributes } = await ddb.send(
      new UpdateCommand({
        TableName: config.tables.tasks,
        Key: { taskId: task.taskId, projectId: task.projectId },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ReturnValues: "ALL_NEW",
      })
    );

    const updated = Attributes as Task;

    await Promise.allSettled([
      (async () => {
        if (body.status && body.status !== task.status) {
          await recordStatusChange({
            taskId: task.taskId,
            fromStatus: task.status,
            toStatus: updated.status,
            changedBy: user.sub,
            orgId: task.orgId,
          });
          await recordActivity({
            taskId: task.taskId,
            orgId: task.orgId,
            userId: user.sub,
            type: "STATUS_CHANGED",
            payload: { fromStatus: task.status, toStatus: updated.status },
          });
          if (updated.status === "Done") {
            await emitMetric("TasksClosed", 1, { TeamId: updated.teamId, OrgId: task.orgId });
            if (task.createdAt) {
              const hoursToClose = (Date.now() - new Date(task.createdAt).getTime()) / 3_600_000;
              if (hoursToClose >= 0) {
                await emitMetric(
                  "TaskTimeToClose",
                  Number(hoursToClose.toFixed(2)),
                  { TeamId: updated.teamId, OrgId: task.orgId },
                  "None"
                );
              }
            }
          }
        }
      })(),
      (async () => {
        if (isManager && body.assigneeId && body.assigneeId !== task.assigneeId) {
          await publishTaskAssignment({
            taskId: updated.taskId,
            taskTitle: updated.title,
            assigneeId: updated.assigneeId,
            teamId: updated.teamId,
            orgId: task.orgId,
            assignedBy: user.sub,
          });
          await recordActivity({
            taskId: updated.taskId,
            orgId: task.orgId,
            userId: user.sub,
            type: "TASK_ASSIGNED",
            payload: { assigneeId: updated.assigneeId },
          });
        }
      })(),
    ]);

    res.json(updated);
  })
);

// GET /tasks/digest/today — tasks due today, grouped by assignee.
// Managers see the whole org; employees see only their team (server-side).
router.get(
  "/digest/today",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const today = new Date().toISOString().split("T")[0];

    let items: Record<string, unknown>[];
    if (user.role === "manager" || user.role === "admin") {
      const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.tasks }));
      items = filterScope(Items ?? [], undefined, user.orgId);
    } else {
      const { Items } = await ddb.send(
        new QueryCommand({
          TableName: config.tables.tasks,
          IndexName: config.indexes.tasksTeam,
          KeyConditionExpression: "teamId = :tid",
          ExpressionAttributeValues: { ":tid": user.teamId },
        })
      );
      items = filterScope(Items ?? [], undefined, user.orgId);
    }

    const dueToday = items.filter(
      (t) => ((t.deadline as string) ?? "").split("T")[0] === today
    );

    const byAssignee = dueToday.reduce<Record<string, Record<string, unknown>[]>>(
      (acc, task) => {
        const key = (task.assigneeId as string) || "unassigned";
        (acc[key] ??= []).push(task);
        return acc;
      },
      {}
    );

    res.json({ date: today, total: dueToday.length, byAssignee });
  })
);

router.delete(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task || !assertSameOrg(req, task.orgId)) throw new HttpError(404, "Task not found");
    await ddb.send(
      new DeleteCommand({
        TableName: config.tables.tasks,
        Key: { taskId: task.taskId, projectId: task.projectId },
      })
    );
    res.status(204).send();
  })
);

export { router as tasksRouter, getTaskById };
