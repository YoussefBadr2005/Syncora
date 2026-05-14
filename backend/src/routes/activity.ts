import { Router } from "express";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { asyncHandler } from "../middleware/error";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { taskId, limit } = req.query as { taskId?: string; limit?: string };
    const { Items } = await ddb.send(
      new ScanCommand({
        TableName: config.tables.activityLogs,
        Limit: 100,
      })
    );
    let results = Items ?? [];

    // Filter by taskId if provided
    if (taskId) {
      results = results.filter((a: any) => a.taskId === taskId);
    }

    // Sort descending by timestamp
    const sorted = results.sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Limit results (default 20, max 100)
    const limitNum = Math.min(parseInt(limit ?? "20", 10), 100);
    res.json(sorted.slice(0, limitNum));
  })
);

export default router;
