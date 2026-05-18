import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb } from "../aws";
import { config } from "../config";
import { Task, TaskStatus } from "../types";
import { emitMetric } from "./notifications";

const DONE: TaskStatus = "Done";

function isOverdue(task: Task, now: Date): boolean {
  if (!task.deadline || task.status === DONE) return false;
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline < now;
}

/** Count overdue open tasks for an org and publish OverdueTasks to CloudWatch. */
export async function publishOverdueTasksMetric(orgId: string): Promise<number> {
  const { Items } = await ddb.send(new ScanCommand({ TableName: config.tables.tasks }));
  const now = new Date();
  const count = ((Items ?? []) as Task[]).filter(
    (t) => t.orgId === orgId && isOverdue(t, now)
  ).length;

  await emitMetric("OverdueTasks", count, { OrgId: orgId });
  return count;
}

export function secondsToClose(createdAt: string, closedAt: Date): number {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.round((closedAt.getTime() - created) / 1000));
}
