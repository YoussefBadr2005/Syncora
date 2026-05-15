import { Router } from "express";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { asyncHandler } from "../middleware/error";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { taskId, limit } = req.query as { taskId?: string; limit?: string };
    const orgId = req.user!.orgId;
    const limitNum = Math.min(parseInt(limit ?? "20", 10) || 20, 100);

    let items: Record<string, unknown>[];

    if (taskId) {
      const { Items } = await ddb.send(
        new QueryCommand({
          TableName: config.tables.activityLogs,
          IndexName: config.indexes.activityTask,
          KeyConditionExpression: "taskId = :t",
          ExpressionAttributeValues: { ":t": taskId },
        })
      );
      // A task-scoped feed is still org-scoped to prevent cross-org leakage.
      items = (Items ?? []).filter((it) => it.orgId === orgId);
    } else {
      const { Items } = await ddb.send(
        new QueryCommand({
          TableName: config.tables.activityLogs,
          IndexName: config.indexes.activityOrg,
          KeyConditionExpression: "orgId = :o",
          ExpressionAttributeValues: { ":o": orgId },
        })
      );
      items = Items ?? [];
    }

    const sorted = items.sort(
      (a, b) =>
        new Date(b.createdAt as string).getTime() -
        new Date(a.createdAt as string).getTime()
    );
    res.json(sorted.slice(0, limitNum));
  })
);

export default router;
