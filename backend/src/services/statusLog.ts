import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { ddb } from "../aws";
import { config } from "../config";

export async function recordStatusChange(params: {
  taskId: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  orgId: string;
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
        orgId: params.orgId,
        changedAt: new Date().toISOString(),
      },
    })
  );
}
