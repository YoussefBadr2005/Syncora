import { Router } from "express";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { asyncHandler } from "../middleware/error";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { Items } = await ddb.send(
      new ScanCommand({
        TableName: config.tables.activityLogs,
        Limit: 200,
      })
    );
    const scoped = (Items ?? []).filter((it) => it.orgId === req.user!.orgId);
    const sorted = scoped.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json(sorted.slice(0, 20));
  })
);

export default router;
