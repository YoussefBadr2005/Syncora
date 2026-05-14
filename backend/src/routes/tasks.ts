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
        assignedBy: req.user!.sub,
      }),
      recordActivity({
        taskId: task.taskId,
        userId: req.user!.sub,
        type: "TASK_CREATED",
        payload: { title: task.title },
      }),
      emitMetric("TasksCreated", 1, { TeamId: task.teamId }),
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
        return res.json(filterByProject(Items ?? [], projectId));
      }
      const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.tasks }));
      return res.json(filterByProject(Items ?? [], projectId));
    }

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: config.tables.tasks,
        IndexName: config.indexes.tasksTeam,
        KeyConditionExpression: "teamId = :tid",
        ExpressionAttributeValues: { ":tid": user.teamId },
      })
    );
    res.json(filterByProject(Items ?? [], projectId));
  })
);

function filterByProject(items: Record<string, unknown>[], projectId?: string) {
  if (!projectId) return items;
  return items.filter((it) => it.projectId === projectId);
}

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task) throw new HttpError(404, "Task not found");
    if (!assertTeamMatches(req, task.teamId)) throw new HttpError(403, "Forbidden");
    res.json(task);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task) throw new HttpError(404, "Task not found");

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
          });
          await recordActivity({
            taskId: task.taskId,
            userId: user.sub,
            type: "STATUS_CHANGED",
            payload: { fromStatus: task.status, toStatus: updated.status },
          });
          if (updated.status === "Done") {
            await emitMetric("TasksClosed", 1, { TeamId: updated.teamId });
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
            assignedBy: user.sub,
          });
          await recordActivity({
            taskId: updated.taskId,
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

// GET /tasks/digest/today — fetch tasks due today, grouped by assignee
router.get(
  "/digest/today",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Scan all tasks
    const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.tasks }));
    const tasks = Items ?? [];

    // Filter by deadline = today
    const todayTasks = tasks.filter((t: Record<string, any>) => {
      const taskDate = (t.deadline ?? "").split("T")[0];
      return taskDate === today;
    });

    // Apply team access control
    const filtered = todayTasks.filter((t: Record<string, any>) => {
      if (user.role === "manager" || user.role === "admin") return true;
      return t.teamId === user.teamId;
    });

    // Group by assigneeId
    const grouped = filtered.reduce((acc: Record<string, any[]>, task: any) => {
      const key = task.assigneeId || "unassigned";
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});

    res.json({
      date: today,
      total: filtered.length,
      byAssignee: grouped,
    });
  })
);

router.delete(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task) throw new HttpError(404, "Task not found");
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
