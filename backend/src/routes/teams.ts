import { Router } from "express";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb } from "../aws";
import { config } from "../config";
import { requireRole } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/error";

const router = Router();

// POST /teams — admin/manager only, stamped with caller's org
router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name } = req.body ?? {};
    if (!name) throw new HttpError(400, "name required");
    const team = {
      teamId: uuid(),
      name,
      orgId: req.user!.orgId,
      memberIds: [] as string[],
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: config.tables.teams, Item: team }));
    res.status(201).json(team);
  })
);

// GET /teams
// Manager/admin → all teams in their org via Query on orgId-index
// Employee      → only their own team (single GetCommand by teamId), verified by org
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { role, teamId, orgId } = req.user!;

    if (role === "manager" || role === "admin") {
      const { Items } = await ddb.send(
        new QueryCommand({
          TableName: config.tables.teams,
          IndexName: config.indexes.teamsOrg,
          KeyConditionExpression: "orgId = :o",
          ExpressionAttributeValues: { ":o": orgId },
        })
      );
      return res.json(Items ?? []);
    }

    if (!teamId) return res.json([]);
    const { Item } = await ddb.send(
      new GetCommand({ TableName: config.tables.teams, Key: { teamId } })
    );
    if (!Item || Item.orgId !== orgId) return res.json([]);
    return res.json([Item]);
  })
);

// GET /teams/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { role, teamId: userTeamId, orgId } = req.user!;
    const requestedId = req.params.id;

    const { Item } = await ddb.send(
      new GetCommand({ TableName: config.tables.teams, Key: { teamId: requestedId } })
    );
    if (!Item || Item.orgId !== orgId) throw new HttpError(404, "Team not found");

    if (role === "employee" && requestedId !== userTeamId) {
      throw new HttpError(403, "Access denied: you can only view your own team");
    }
    res.json(Item);
  })
);

// POST /teams/:id/members — admin/manager only, within their org
router.post(
  "/:id/members",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId) throw new HttpError(400, "userId required");

    const { Item: team } = await ddb.send(
      new GetCommand({ TableName: config.tables.teams, Key: { teamId: req.params.id } })
    );
    if (!team || team.orgId !== req.user!.orgId) throw new HttpError(404, "Team not found");

    const { Item: user } = await ddb.send(
      new GetCommand({ TableName: config.tables.users, Key: { userId } })
    );
    if (!user || user.orgId !== req.user!.orgId) throw new HttpError(404, "User not found");

    const { Attributes } = await ddb.send(
      new UpdateCommand({
        TableName: config.tables.teams,
        Key: { teamId: req.params.id },
        UpdateExpression:
          "SET memberIds = list_append(if_not_exists(memberIds, :empty), :u)",
        ExpressionAttributeValues: { ":u": [userId], ":empty": [] },
        ConditionExpression: "attribute_exists(teamId)",
        ReturnValues: "ALL_NEW",
      })
    );
    res.json(Attributes);
  })
);

export default router;
