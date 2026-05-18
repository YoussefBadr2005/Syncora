import { Router } from "express";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { asyncHandler } from "../middleware/error";

const router = Router();

interface FeedItem {
  logId: string;
  taskId: string;
  orgId?: string;
  userId?: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

function dedupeKey(item: FeedItem): string {
  const p = item.payload;
  if (item.type === "STATUS_CHANGED") {
    return `${item.taskId}:${p.fromStatus}:${p.toStatus}:${item.createdAt.slice(0, 19)}`;
  }
  return item.logId;
}

async function loadStatusLogs(taskId: string | undefined, orgId: string): Promise<FeedItem[]> {
  const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.statusLogs }));
  const rows = (Items ?? []).filter((it) => {
    if (it.orgId !== orgId) return false;
    if (taskId && it.taskId !== taskId) return false;
    return true;
  });

  return rows.map((row) => ({
    logId: `status-${row.logId as string}`,
    taskId: row.taskId as string,
    orgId: row.orgId as string,
    userId: row.changedBy as string,
    type: "STATUS_CHANGED",
    payload: {
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
    },
    createdAt: (row.changedAt as string) ?? new Date().toISOString(),
  }));
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { taskId, limit } = req.query as { taskId?: string; limit?: string };
    const orgId = req.user!.orgId;
    const limitNum = Math.min(parseInt(limit ?? "20", 10) || 20, 100);

    let items: FeedItem[];

    if (taskId) {
      const { Items } = await ddb.send(
        new QueryCommand({
          TableName: config.tables.activityLogs,
          IndexName: config.indexes.activityTask,
          KeyConditionExpression: "taskId = :t",
          ExpressionAttributeValues: { ":t": taskId },
        })
      );
      items = (Items ?? []).filter((it) => it.orgId === orgId) as FeedItem[];
    } else {
      const { Items } = await ddb.send(
        new QueryCommand({
          TableName: config.tables.activityLogs,
          IndexName: config.indexes.activityOrg,
          KeyConditionExpression: "orgId = :o",
          ExpressionAttributeValues: { ":o": orgId },
        })
      );
      items = (Items ?? []) as FeedItem[];
    }

    const statusItems = await loadStatusLogs(taskId, orgId);
    const seen = new Set(items.map(dedupeKey));
    for (const s of statusItems) {
      const key = dedupeKey(s);
      if (!seen.has(key)) {
        items.push(s);
        seen.add(key);
      }
    }

    const sorted = items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    res.json(sorted.slice(0, limitNum));
  })
);

export default router;
