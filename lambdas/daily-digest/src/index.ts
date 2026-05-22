import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});
const cw = new CloudWatchClient({});

const TASKS_TABLE = process.env.DDB_TASKS_TABLE ?? "Tasks";
const USERS_TABLE = process.env.DDB_USERS_TABLE ?? "Users";
const DIGEST_TOPIC_ARN = process.env.SNS_DIGEST_TOPIC_ARN!;
const CW_NAMESPACE = process.env.CW_NAMESPACE ?? "MiniJira";

// Scan for tasks past their deadline and not Done, and publish an OverdueTasks
// custom metric (total + per team) so a CloudWatch alarm can notify ops via SNS.
async function emitOverdueMetric(today: string): Promise<void> {
  const { Items } = await dynamo.send(
    new ScanCommand({
      TableName: TASKS_TABLE,
      FilterExpression: "deadline <> :empty AND deadline < :today AND #s <> :done",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":empty": "", ":today": today, ":done": "Done" },
    })
  );
  const overdue = (Items as Task[]) ?? [];
  const perTeam = overdue.reduce<Record<string, number>>((acc, t) => {
    acc[t.teamId] = (acc[t.teamId] ?? 0) + 1;
    return acc;
  }, {});

  const metricData = [
    { MetricName: "OverdueTasks", Value: overdue.length, Unit: "Count" as const, Timestamp: new Date() },
    ...Object.entries(perTeam).map(([teamId, count]) => ({
      MetricName: "OverdueTasks",
      Dimensions: [{ Name: "TeamId", Value: teamId }],
      Value: count,
      Unit: "Count" as const,
      Timestamp: new Date(),
    })),
  ];

  await cw.send(new PutMetricDataCommand({ Namespace: CW_NAMESPACE, MetricData: metricData }));
  console.log(`OverdueTasks metric published: ${overdue.length} total`);
}

interface Task {
  taskId: string;
  title: string;
  deadline: string;
  status: string;
  assigneeId: string;
  teamId: string;
}

interface User {
  userId: string;
  email: string;
  name?: string;
}

export const handler = async (): Promise<void> => {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  console.log(`Daily digest for: ${today}`);

  // Publish the OverdueTasks metric first so it runs regardless of today's load.
  try {
    await emitOverdueMetric(today);
  } catch (err) {
    console.error("Failed to emit OverdueTasks metric", err);
  }

  // Scan for tasks due today that are not yet Done
  const { Items: tasks } = await dynamo.send(
    new ScanCommand({
      TableName: TASKS_TABLE,
      FilterExpression:
        "begins_with(deadline, :today) AND #s <> :done",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":today": today,
        ":done": "Done",
      },
    })
  );

  if (!tasks?.length) {
    console.log("No tasks due today — nothing to digest.");
    return;
  }

  console.log(`Found ${tasks.length} task(s) due today`);

  // Group tasks by assignee
  const byAssignee = (tasks as Task[]).reduce<Record<string, Task[]>>(
    (acc, task) => {
      if (!acc[task.assigneeId]) acc[task.assigneeId] = [];
      acc[task.assigneeId].push(task);
      return acc;
    },
    {}
  );

  // Fetch all relevant users in one scan (small user base for demo)
  const { Items: users } = await dynamo.send(
    new ScanCommand({ TableName: USERS_TABLE })
  );
  const userMap = (users as User[]).reduce<Record<string, User>>(
    (acc, u) => { acc[u.userId] = u; return acc; },
    {}
  );

  // Publish one SNS message per assignee
  for (const [assigneeId, assigneeTasks] of Object.entries(byAssignee)) {
    const user = userMap[assigneeId];
    const name = user?.name ?? user?.email ?? assigneeId;
    const taskList = assigneeTasks
      .map((t) => `  • [${t.status}] ${t.title}`)
      .join("\n");

    const message = [
      `Hi ${name},`,
      ``,
      `You have ${assigneeTasks.length} task(s) due today (${today}):`,
      ``,
      taskList,
      ``,
      `Please update your task status in Mini-Jira.`,
    ].join("\n");

    await sns.send(
      new PublishCommand({
        TopicArn: DIGEST_TOPIC_ARN,
        Subject: `Mini-Jira Daily Digest — ${assigneeTasks.length} task(s) due today`,
        Message: message,
        MessageAttributes: {
          assigneeId: { DataType: "String", StringValue: assigneeId },
        },
      })
    );

    console.log(`Digest sent for ${name} (${assigneeTasks.length} tasks)`);
  }
};
