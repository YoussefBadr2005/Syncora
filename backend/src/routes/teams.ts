import { Router } from "express";
import {
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb } from "../aws";
import { config } from "../config";
import { requireRole } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/error";

const router = Router();

router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { name } = req.body ?? {};
    if (!name) throw new HttpError(400, "name required");
    const team = {
      teamId: uuid(),
      name,
      memberIds: [] as string[],
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: config.tables.teams, Item: team }));
    res.status(201).json(team);
  })
);

router.get(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (_req, res) => {
    const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.teams }));
    res.json(Items ?? []);
  })
);

router.get(
  "/:id",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { Item } = await ddb.send(
      new GetCommand({ TableName: config.tables.teams, Key: { teamId: req.params.id } })
    );
    if (!Item) throw new HttpError(404, "Team not found");
    res.json(Item);
  })
);

router.post(
  "/:id/members",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId) throw new HttpError(400, "userId required");
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
