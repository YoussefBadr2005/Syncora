import { PublishCommand } from "@aws-sdk/client-sns";
import { PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { sns, cw } from "../aws";
import { config } from "../config";

export async function publishTaskAssignment(payload: {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  teamId: string;
  orgId: string;
  assignedBy: string;
}) {
  if (!config.sns.taskAssignmentTopicArn) return;
  await sns.send(
    new PublishCommand({
      TopicArn: config.sns.taskAssignmentTopicArn,
      Subject: `New Task Assigned: ${payload.taskTitle}`.slice(0, 99),
      Message: JSON.stringify({
        ...payload,
        assignedAt: new Date().toISOString(),
      }),
    })
  );
}

export async function emitMetric(
  name: string,
  value: number,
  dims: Record<string, string> = {},
  unit: "Count" | "Seconds" = "Count"
) {
  try {
    await cw.send(
      new PutMetricDataCommand({
        Namespace: config.cloudwatch.namespace,
        MetricData: [
          {
            MetricName: name,
            Value: value,
            Unit: unit,
            Dimensions: Object.entries(dims).map(([Name, Value]) => ({ Name, Value })),
          },
        ],
      })
    );
  } catch (err) {
    console.error("[cw] putMetric failed", err);
  }
}
