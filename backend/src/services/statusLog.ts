import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb } from "../aws";
import { config } from "../config";

export async function recordStatusChange(params: {
  taskId: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
}) {
  await ddb.send(
    new PutCommand({
      TableName: config.tables.statusLogs,
      Item: {
        logId: uuid(),
        taskId: params.taskId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        changedBy: params.changedBy,
        changedAt: new Date().toISOString(),
      },
    })
  );
}

export async function recordActivity(params: {
  taskId: string;
  userId: string;
  type: "TASK_CREATED" | "STATUS_CHANGED" | "TASK_ASSIGNED" | "COMMENT_ADDED";
  payload?: Record<string, unknown>;
}) {
  await ddb.send(
    new PutCommand({
      TableName: config.tables.activityLogs,
      Item: {
        logId: uuid(),
        taskId: params.taskId,
        userId: params.userId,
        type: params.type,
        payload: params.payload ?? {},
        createdAt: new Date().toISOString(),
      },
    })
  );
}
