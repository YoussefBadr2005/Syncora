import { Router } from "express";
import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { requireRole } from "../middleware/auth";
import { asyncHandler, HttpError } from "../middleware/error";

const router = Router();

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const { Item } = await ddb.send(
      new GetCommand({ TableName: config.tables.users, Key: { userId: req.user!.sub } })
    );
    res.json(
      Item ?? {
        userId: req.user!.sub,
        email: req.user!.email,
        role: req.user!.role,
        teamId: req.user!.teamId,
      }
    );
  })
);

router.get(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (_req, res) => {
    const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.users }));
    res.json(Items ?? []);
  })
);

router.post(
  "/",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const { userId, email, role, teamId, name } = req.body ?? {};
    if (!userId || !email || !role) {
      throw new HttpError(400, "userId, email, role required");
    }
    const item = {
      userId,
      email,
      role,
      teamId: teamId ?? "",
      name: name ?? "",
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: config.tables.users, Item: item }));
    res.status(201).json(item);
  })
);

export default router;
