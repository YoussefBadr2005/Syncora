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
import { Project } from "../types";

const router = Router();

router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name, description, teamId } = req.body ?? {};
    if (!name || !teamId) throw new HttpError(400, "name and teamId are required");

    const project: Project = {
      projectId: uuid(),
      name,
      description: description ?? "",
      teamId,
      createdBy: req.user!.sub,
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: config.tables.projects, Item: project }));
    res.status(201).json(project);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (user.role === "manager" || user.role === "admin") {
      const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.projects }));
      return res.json(Items ?? []);
    }
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: config.tables.projects,
        IndexName: config.indexes.projectsTeam,
        KeyConditionExpression: "teamId = :tid",
        ExpressionAttributeValues: { ":tid": user.teamId },
      })
    );
    res.json(Items ?? []);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { Item } = await ddb.send(
      new GetCommand({
        TableName: config.tables.projects,
        Key: { projectId: req.params.id },
      })
    );
    if (!Item) throw new HttpError(404, "Project not found");
    if (!assertTeamMatches(req, Item.teamId)) throw new HttpError(403, "Forbidden");
    res.json(Item);
  })
);

router.put(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name, description, teamId } = req.body ?? {};
    const sets: string[] = [];
    const values: Record<string, unknown> = {};
    const names: Record<string, string> = {};
    if (name !== undefined) {
      sets.push("#n = :n");
      names["#n"] = "name";
      values[":n"] = name;
    }
    if (description !== undefined) {
      sets.push("description = :d");
      values[":d"] = description;
    }
    if (teamId !== undefined) {
      sets.push("teamId = :t");
      values[":t"] = teamId;
    }
    if (!sets.length) throw new HttpError(400, "No fields to update");

    const { Attributes } = await ddb.send(
      new UpdateCommand({
        TableName: config.tables.projects,
        Key: { projectId: req.params.id },
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeValues: values,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ConditionExpression: "attribute_exists(projectId)",
        ReturnValues: "ALL_NEW",
      })
    );
    res.json(Attributes);
  })
);

router.delete(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    await ddb.send(
      new DeleteCommand({
        TableName: config.tables.projects,
        Key: { projectId: req.params.id },
      })
    );
    res.status(204).send();
  })
);

export default router;
