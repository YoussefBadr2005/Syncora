import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";

// ─── Cognito subs (pass via env vars or edit directly) ────────────────────────
const MANAGER_SUB = process.env.SEED_MANAGER_SUB || "94183458-a061-70db-783b-e7f26435b59d";
const SARA_SUB    = process.env.SEED_SARA_SUB    || "24d81408-7081-705a-9441-0c1aaf0bb3d1";
const OMAR_SUB    = process.env.SEED_OMAR_SUB    || "d4b8b418-d0e1-70ee-6495-701ab0898860";
const ADMIN_SUB   = process.env.SEED_ADMIN_SUB   || "9418f418-c0e1-7090-fffc-caa67adb4c5b";

// ─── Team IDs — must match what's already in DynamoDB ────────────────────────
const FRONTEND_TEAM = process.env.SEED_FRONTEND_TEAM_ID || "42364935-da79-413e-b30d-6ffaa47b780a";
const BACKEND_TEAM  = process.env.SEED_BACKEND_TEAM_ID  || "669287f0-53d3-4b13-880c-275b35926a25";
const QA_TEAM       = process.env.SEED_QA_TEAM_ID       || "99b051dd-d4c5-458c-9128-d263e1813491";
const DEVOPS_TEAM   = process.env.SEED_DEVOPS_TEAM_ID   || "0fd43d5e-3dda-4e78-a695-3f633a024feb";

const TABLES = {
  organizations: process.env.DDB_ORGS_TABLE || "Organizations",
  users:    process.env.DDB_USERS_TABLE    || "Users",
  teams:    process.env.DDB_TEAMS_TABLE    || "Teams",
  projects: process.env.DDB_PROJECTS_TABLE || "Projects",
  tasks:    process.env.DDB_TASKS_TABLE    || "Tasks",
  comments: process.env.DDB_COMMENTS_TABLE || "Comments",
  statusLogs: process.env.DDB_STATUS_LOGS_TABLE || "StatusLogs",
  activityLogs: process.env.DDB_ACTIVITY_LOGS_TABLE || "ActivityLogs",
};

// Key schemas matching the actual DynamoDB tables
const KEY_SCHEMA: Record<string, string[]> = {
  [TABLES.organizations]: ["orgId"],
  [TABLES.users]:    ["userId"],
  [TABLES.teams]:    ["teamId"],
  [TABLES.projects]: ["projectId"],
  [TABLES.tasks]:    ["taskId", "projectId"],
  [TABLES.comments]: ["commentId", "taskId"],
  [TABLES.statusLogs]: ["logId"],
  [TABLES.activityLogs]: ["logId"],
};

const region = process.env.AWS_REGION || "us-east-1";
const ddb    = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

const DEMO_ORG_ID = "syncora-demo-org";

const now         = () => new Date().toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().split("T")[0];
const daysAgo     = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function put(table: string, item: Record<string, unknown>) {
  await ddb.send(new PutCommand({ TableName: table, Item: item }));
  const label = (item.name ?? item.title ?? item.body ?? item.email ?? item.teamId ?? "item") as string;
  console.log(`  ✓ [${table}] ${String(label).slice(0, 60)}`);
}

async function clearTable(table: string) {
  const { Items } = await ddb.send(new ScanCommand({ TableName: table }));
  if (!Items?.length) return;
  const keys = KEY_SCHEMA[table];
  for (const item of Items) {
    const key = Object.fromEntries(keys.map(k => [k, item[k]]));
    await ddb.send(new DeleteCommand({ TableName: table, Key: key }));
  }
  console.log(`  cleared ${Items.length} item(s) from ${table}`);
}

async function main() {
  console.log("\n🌱 Syncora seed starting...\n");

  // ── Clear ──────────────────────────────────────────────────────────────────
  console.log("⚠  Clearing existing data...");
  for (const t of Object.values(TABLES)) await clearTable(t);

  // ── Organization ────────────────────────────────────────────────────────────
  console.log("\n🏢 Organization...");
  await put(TABLES.organizations, {
    orgId: DEMO_ORG_ID,
    name: "Syncora Demo",
    ownerUserId: MANAGER_SUB,
    createdAt: now(),
  });

  // ── Teams (keep existing UUIDs — just refresh the rows) ───────────────────
  console.log("\n📦 Teams...");
  await put(TABLES.teams, { teamId: FRONTEND_TEAM, name: "Frontend", orgId: DEMO_ORG_ID, memberIds: [SARA_SUB],  createdAt: now() });
  await put(TABLES.teams, { teamId: BACKEND_TEAM,  name: "Backend",  orgId: DEMO_ORG_ID, memberIds: [OMAR_SUB],  createdAt: now() });
  await put(TABLES.teams, { teamId: QA_TEAM,       name: "QA",       orgId: DEMO_ORG_ID, memberIds: [],           createdAt: now() });
  await put(TABLES.teams, { teamId: DEVOPS_TEAM,   name: "DevOps",   orgId: DEMO_ORG_ID, memberIds: [],           createdAt: now() });

  // ── Users ─────────────────────────────────────────────────────────────────
  console.log("\n👥 Users...");
  await put(TABLES.users, { userId: MANAGER_SUB, email: "ali@demo.com",  name: "Ali",  role: "manager",  teamId: "",           orgId: DEMO_ORG_ID, createdAt: now() });
  await put(TABLES.users, { userId: SARA_SUB,    email: "sara@demo.com", name: "Sara", role: "employee", teamId: FRONTEND_TEAM, orgId: DEMO_ORG_ID, createdAt: now() });
  await put(TABLES.users, { userId: OMAR_SUB,    email: "omar@demo.com", name: "Omar", role: "employee", teamId: BACKEND_TEAM,  orgId: DEMO_ORG_ID, createdAt: now() });
  await put(TABLES.users, { userId: ADMIN_SUB,   email: "admin@demo.com", name: "Admin", role: "admin",  teamId: "",           orgId: DEMO_ORG_ID, createdAt: now() });

  // ── Projects ──────────────────────────────────────────────────────────────
  console.log("\n📁 Projects...");
  const p1 = uuid();
  const p2 = uuid();
  const p3 = uuid();
  const p4 = uuid();
  await put(TABLES.projects, { projectId: p1, name: "Syncora Web App",       orgId: DEMO_ORG_ID, description: "Next.js frontend",              teamId: FRONTEND_TEAM, createdBy: MANAGER_SUB, createdAt: now() });
  await put(TABLES.projects, { projectId: p2, name: "API & Infrastructure",  orgId: DEMO_ORG_ID, description: "Express backend + DynamoDB",    teamId: BACKEND_TEAM,  createdBy: MANAGER_SUB, createdAt: now() });
  await put(TABLES.projects, { projectId: p3, name: "Test Automation Suite", orgId: DEMO_ORG_ID, description: "E2E and integration tests",      teamId: QA_TEAM,       createdBy: MANAGER_SUB, createdAt: now() });
  await put(TABLES.projects, { projectId: p4, name: "CI/CD Pipeline",        orgId: DEMO_ORG_ID, description: "GitHub Actions + EC2 deploys",  teamId: DEVOPS_TEAM,   createdBy: MANAGER_SUB, createdAt: now() });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  console.log("\n✅ Tasks...");

  const mkTask = (
    projectId: string, teamId: string, assigneeId: string,
    title: string, description: string,
    status: "To Do" | "In Progress" | "In Review" | "Done",
    priority: "Low" | "Medium" | "High",
    deadlineOffset: number, createdDaysAgo = 0,
  ) => ({
    taskId:      uuid(),
    projectId,   teamId,   assigneeId,
    orgId:       DEMO_ORG_ID,
    title,       description, status, priority,
    deadline:    daysFromNow(deadlineOffset),
    createdBy:   MANAGER_SUB,
    createdAt:   daysAgo(createdDaysAgo),
    updatedAt:   status === "Done" ? daysAgo(Math.max(0, createdDaysAgo - 1)) : now(),
  });

  // Sara — Frontend tasks
  const t1 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Kanban drag-and-drop", "Add dnd reordering", "To Do", "High", 5, 2);
  const t2 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Dashboard cards", "Update icons", "In Progress", "Medium", 3, 4);
  const t3 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Sidebar bug", "Collapse fix", "In Review", "Low", 7, 6);
  const t4 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Dark mode", "CSS variables", "Done", "Low", -5, 10);

  // Omar — Backend tasks
  const t5 = mkTask(p2, BACKEND_TEAM, OMAR_SUB, "Cognito ID tokens", "Update validation", "To Do", "High", 2, 1);
  const t6 = mkTask(p2, BACKEND_TEAM, OMAR_SUB, "DynamoDB GSIs", "Add assignee index", "In Progress", "High", 4, 3);
  const t7 = mkTask(p2, BACKEND_TEAM, OMAR_SUB, "S3 Presigned URLs", "Task image uploads", "Done", "Medium", -3, 8);

  // QA tasks
  const t8 = mkTask(p3, QA_TEAM, SARA_SUB, "E2E tests", "Full manager flow", "To Do", "High", 6, 1);
  const t9 = mkTask(p3, QA_TEAM, SARA_SUB, "Kanban tests", "State transition rules", "In Progress", "Medium", 8, 2);

  // DevOps tasks
  const t10 = mkTask(p4, DEVOPS_TEAM, OMAR_SUB, "Auto Scaling", "ALB attachment", "In Progress", "High", 3, 3);
  const t11 = mkTask(p4, DEVOPS_TEAM, OMAR_SUB, "CloudWatch", "Dashboard metrics", "To Do", "Medium", 10, 0);
  const t12 = mkTask(p4, DEVOPS_TEAM, OMAR_SUB, "Team isolation", "Security testing", "In Review", "High", -1, 5);

  for (const t of [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12]) {
    await put(TABLES.tasks, t as Record<string, unknown>);
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  console.log("\n💬 Comments...");
  const mkComment = (taskId: string, authorId: string, body: string, daysBack = 0) => ({
    commentId: uuid(), taskId, authorId, body, orgId: DEMO_ORG_ID, createdAt: daysAgo(daysBack),
  });

  await put(TABLES.comments, mkComment(t2.taskId, MANAGER_SUB, "Use exact hex values.", 3));
  await put(TABLES.comments, mkComment(t2.taskId, SARA_SUB,    "Done.", 1));
  await put(TABLES.comments, mkComment(t6.taskId, OMAR_SUB,    "GSI created.", 2));
  await put(TABLES.comments, mkComment(t6.taskId, MANAGER_SUB, "Ensure index usage.", 1));
  await put(TABLES.comments, mkComment(t7.taskId, OMAR_SUB,    "Presigned URL works.", 5));
  await put(TABLES.comments, mkComment(t10.taskId, OMAR_SUB,   "Both instances healthy.", 1));

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
✅ Seed complete! (Org: ${DEMO_ORG_ID})
`);
}

main().catch(err => {
  console.error("\n❌ Seed failed:", err.message ?? err);
  process.exit(1);
});
