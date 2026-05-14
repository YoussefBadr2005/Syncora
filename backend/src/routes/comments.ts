import { Router } from "express";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb } from "../aws";
import { config } from "../config";
import { asyncHandler, HttpError } from "../middleware/error";
import { assertTeamMatches } from "../middleware/teamGuard";
import { getTaskById } from "./tasks";
import { recordActivity } from "../services/statusLog";
import { Comment } from "../types";

const router = Router({ mergeParams: true });

router.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task) throw new HttpError(404, "Task not found");
    if (!assertTeamMatches(req, task.teamId)) throw new HttpError(403, "Forbidden");

    const { body } = req.body ?? {};
    if (!body || typeof body !== "string") throw new HttpError(400, "body is required");

    const comment: Comment = {
      commentId: uuid(),
      taskId: task.taskId,
      authorId: req.user!.sub,
      body,
      createdAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: config.tables.comments, Item: comment }));
    
    // Log activity for comment
    await recordActivity({
      taskId: task.taskId,
      userId: req.user!.sub,
      type: "COMMENT_ADDED",
      payload: { commentId: comment.commentId, preview: body.slice(0, 50) },
    }).catch(() => null); // Ignore activity logging errors
    
    res.status(201).json(comment);
  })
);

router.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task) throw new HttpError(404, "Task not found");
    if (!assertTeamMatches(req, task.teamId)) throw new HttpError(403, "Forbidden");

    const { Items } = await ddb.send(
      new QueryCommand({
        TableName: config.tables.comments,
        IndexName: config.indexes.commentsTask,
        KeyConditionExpression: "taskId = :t",
        ExpressionAttributeValues: { ":t": task.taskId },
      })
    );
    res.json(Items ?? []);
  })
);

export default router;
