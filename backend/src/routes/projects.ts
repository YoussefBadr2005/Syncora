import { Router } from "express";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb } from "../aws";
import { config } from "../config";
import { requireRole } from "../middleware/auth";
import { assertTeamMatches } from "../middleware/teamGuard";
import { assertSameOrg } from "../middleware/orgGuard";
import { asyncHandler, HttpError } from "../middleware/error";
import { Project } from "../types";

const router = Router();

router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name, description, teamId } = req.body ?? {};
    if (!name || !teamId) throw new HttpError(400, "name and teamId are required");

    // Verify team belongs to caller's org.
    const { Item: team } = await ddb.send(
      new GetCommand({ TableName: config.tables.teams, Key: { teamId } })
    );
    if (!team || team.orgId !== req.user!.orgId) {
      throw new HttpError(404, "Team not found");
    }

    const project: Project = {
      projectId: uuid(),
      name,
      description: description ?? "",
      teamId,
      orgId: req.user!.orgId,
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
      // Scan + filter by org. (Projects has no orgId GSI; team membership is org-scoped
      // so this is correct, just a Scan. Volumes are small for the demo.)
      const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.projects }));
      return res.json((Items ?? []).filter((p) => p.orgId === user.orgId));
    }
    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: config.tables.projects,
        IndexName: config.indexes.projectsTeam,
        KeyConditionExpression: "teamId = :tid",
        ExpressionAttributeValues: { ":tid": user.teamId },
      })
    );
    // Defense-in-depth: also filter by org.
    res.json((Items ?? []).filter((p) => p.orgId === user.orgId));
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
    if (!Item || !assertSameOrg(req, Item.orgId as string)) {
      throw new HttpError(404, "Project not found");
    }
    if (!assertTeamMatches(req, Item.teamId)) throw new HttpError(403, "Forbidden");
    res.json(Item);
  })
);

router.put(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name, description, teamId } = req.body ?? {};

    const { Item: existing } = await ddb.send(
      new GetCommand({ TableName: config.tables.projects, Key: { projectId: req.params.id } })
    );
    if (!existing || existing.orgId !== req.user!.orgId) {
      throw new HttpError(404, "Project not found");
    }
    if (teamId) {
      const { Item: team } = await ddb.send(
        new GetCommand({ TableName: config.tables.teams, Key: { teamId } })
      );
      if (!team || team.orgId !== req.user!.orgId) {
        throw new HttpError(404, "Team not found");
      }
    }

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
    const { Item: existing } = await ddb.send(
      new GetCommand({ TableName: config.tables.projects, Key: { projectId: req.params.id } })
    );
    if (!existing || existing.orgId !== req.user!.orgId) {
      throw new HttpError(404, "Project not found");
    }
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
