import { PublishCommand, SubscribeCommand } from "@aws-sdk/client-sns";
import { PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { sns, cw } from "../aws";
import { config } from "../config";

// Subscribe a user's email to the task-assignment topic with a filter policy so
// they only receive assignments addressed to them. SNS sends a confirmation
// email; the address starts receiving notifications once the user confirms.
export async function subscribeUserEmail(email: string) {
  if (!config.sns.taskAssignmentTopicArn || !email) return;
  await sns.send(
    new SubscribeCommand({
      TopicArn: config.sns.taskAssignmentTopicArn,
      Protocol: "email",
      Endpoint: email,
      Attributes: {
        FilterPolicy: JSON.stringify({ assigneeEmail: [email] }),
      },
      ReturnSubscriptionArn: false,
    })
  );
}

export async function publishTaskAssignment(payload: {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  assigneeEmail: string;
  teamId: string;
  orgId: string;
  assignedBy: string;
}) {
  if (!config.sns.taskAssignmentTopicArn) return;

  const assignedAt = new Date().toISOString();
  const data = {
    taskId: payload.taskId,
    taskTitle: payload.taskTitle,
    assigneeId: payload.assigneeId,
    teamId: payload.teamId,
    orgId: payload.orgId,
    assignedBy: payload.assignedBy,
    assignedAt,
  };

  await sns.send(
    new PublishCommand({
      TopicArn: config.sns.taskAssignmentTopicArn,
      Subject: `New Task Assigned: ${payload.taskTitle}`.slice(0, 99),
      MessageStructure: "json",
      Message: JSON.stringify({
        default: JSON.stringify(data),
        sqs: JSON.stringify(data),
        email: [
          `You have a new task assignment in Syncora.`,
          ``,
          `Task:       ${payload.taskTitle}`,
          `Assigned:   ${assignedAt}`,
          ``,
          `Log in to Syncora to view and update this task.`,
        ].join("\n"),
      }),
      MessageAttributes: {
        assigneeEmail: {
          DataType: "String",
          StringValue: payload.assigneeEmail,
        },
      },
    })
  );
}

export async function emitMetric(
  name: string,
  value: number,
  dims: Record<string, string> = {},
  unit: "Count" | "None" | "Seconds" | "Milliseconds" = "Count"
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
