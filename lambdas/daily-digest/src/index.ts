import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

const TASKS_TABLE = process.env.DDB_TASKS_TABLE ?? "Tasks";
const USERS_TABLE = process.env.DDB_USERS_TABLE ?? "Users";
const DIGEST_TOPIC_ARN = process.env.SNS_DIGEST_TOPIC_ARN!;

interface Task {
  taskId: string;
  title: string;
  deadline: string;
  status: string;
  assigneeId: string;
  teamId: string;
  orgId?: string;
}

interface User {
  userId: string;
  email: string;
  name?: string;
}

export const handler = async (): Promise<void> => {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  console.log(`Daily digest for: ${today}`);

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
