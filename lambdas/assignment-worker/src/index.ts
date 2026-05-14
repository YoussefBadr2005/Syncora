import { SQSEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cw = new CloudWatchClient({});

const ACTIVITY_TABLE = process.env.DDB_ACTIVITY_LOGS_TABLE ?? "ActivityLogs";
const CW_NAMESPACE = process.env.CW_NAMESPACE ?? "MiniJira";

interface AssignmentPayload {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  teamId: string;
  assignedBy: string;
  assignedAt: string;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    let payload: AssignmentPayload;

    try {
      // SNS wraps the message in another JSON envelope when fanning out to SQS
      const outer = JSON.parse(record.body);
      payload = typeof outer.Message === "string"
        ? JSON.parse(outer.Message)
        : outer;
    } catch (err) {
      console.error("Failed to parse SQS record body:", record.body, err);
      continue;
    }

    console.log(`Processing assignment: task=${payload.taskId} assignee=${payload.assigneeId}`);

    // 1. Write activity log entry
    await dynamo.send(
      new PutCommand({
        TableName: ACTIVITY_TABLE,
        Item: {
          logId: crypto.randomUUID(),
          taskId: payload.taskId,
          type: "assignment",
          payload,
          createdAt: new Date().toISOString(),
        },
      })
    );

    // 2. Publish custom CloudWatch metric: TasksAssigned per team
    await cw.send(
      new PutMetricDataCommand({
        Namespace: CW_NAMESPACE,
        MetricData: [
          {
            MetricName: "TasksAssigned",
            Dimensions: [{ Name: "TeamId", Value: payload.teamId }],
            Value: 1,
            Unit: "Count",
            Timestamp: new Date(),
          },
        ],
      })
    );

    console.log(`Activity logged and metric emitted for team ${payload.teamId}`);
  }
};
