import { Router } from "express";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { asyncHandler, HttpError } from "../middleware/error";
import { assertTeamMatches } from "../middleware/teamGuard";
import { assertSameOrg } from "../middleware/orgGuard";
import { requireRole } from "../middleware/auth";
import { getTaskById } from "./tasks";
import { getUploadUrl, getDownloadUrl, deleteObject } from "../services/images";
import { recordActivity } from "../services/statusLog";

const router = Router({ mergeParams: true });

router.post(
  "/:id/image",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task || !assertSameOrg(req, task.orgId)) throw new HttpError(404, "Task not found");
    if (!assertTeamMatches(req, task.teamId)) throw new HttpError(403, "Forbidden");

    const { filename, contentType } = req.body ?? {};
    if (!filename) throw new HttpError(400, "filename required");

    const hadImage = !!task.imageKey;
    const { url, key } = await getUploadUrl(task.taskId, filename, contentType);

    await ddb.send(
      new UpdateCommand({
        TableName: config.tables.tasks,
        Key: { taskId: task.taskId, projectId: task.projectId },
        UpdateExpression: "SET imageKey = :k, thumbnailKey = :t, updatedAt = :u",
        ExpressionAttributeValues: {
          ":k": key,
          ":t": key.replace("/originals/", "/thumbnails/"),
          ":u": new Date().toISOString(),
        },
      })
    );

    await recordActivity({
      taskId: task.taskId,
      orgId: task.orgId,
      userId: req.user!.sub,
      type: hadImage ? "IMAGE_REPLACED" : "IMAGE_ATTACHED",
      payload: { filename },
    }).catch(() => undefined);

    res.json({ uploadUrl: url, key });
  })
);

router.get(
  "/:id/image-url",
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task || !assertSameOrg(req, task.orgId)) throw new HttpError(404, "Task not found");
    if (!assertTeamMatches(req, task.teamId)) throw new HttpError(403, "Forbidden");

    const which = (req.query.variant as string) === "original" ? "original" : "thumbnail";
    const bucket = which === "original" ? config.s3.originalsBucket : config.s3.resizedBucket;
    const key = which === "original" ? task.imageKey : task.thumbnailKey;
    if (!key) throw new HttpError(404, "No image attached");

    const url = await getDownloadUrl(bucket, key);
    res.json({ url });
  })
);

router.delete(
  "/:id/image",
  requireRole("manager", "admin"),
  asyncHandler(async (req, res) => {
    const task = await getTaskById(req.params.id);
    if (!task || !assertSameOrg(req, task.orgId)) throw new HttpError(404, "Task not found");

    if (task.imageKey) {
      await deleteObject(config.s3.originalsBucket, task.imageKey).catch(() => undefined);
    }
    if (task.thumbnailKey) {
      await deleteObject(config.s3.resizedBucket, task.thumbnailKey).catch(() => undefined);
    }

    await ddb.send(
      new UpdateCommand({
        TableName: config.tables.tasks,
        Key: { taskId: task.taskId, projectId: task.projectId },
        UpdateExpression: "REMOVE imageKey, thumbnailKey SET updatedAt = :u",
        ExpressionAttributeValues: { ":u": new Date().toISOString() },
      })
    );

    await recordActivity({
      taskId: task.taskId,
      orgId: task.orgId,
      userId: req.user!.sub,
      type: "IMAGE_REMOVED",
      payload: {},
    }).catch(() => undefined);

    res.status(204).send();
  })
);

export default router;
