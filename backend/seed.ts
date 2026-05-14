import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";

// ─── Cognito subs (pass via env vars or edit directly) ────────────────────────
const MANAGER_SUB = process.env.SEED_MANAGER_SUB || "a4d8b498-6071-70d8-8348-9d65426700d3";
const SARA_SUB    = process.env.SEED_SARA_SUB    || "2498a4b8-a071-70fd-0fc1-1e150a047964";
const OMAR_SUB    = process.env.SEED_OMAR_SUB    || "447894a8-80c1-70c8-475a-6ab29dc5f6ef";

// ─── Team IDs — must match what's already in DynamoDB ────────────────────────
const FRONTEND_TEAM = process.env.SEED_FRONTEND_TEAM_ID || "42364935-da79-413e-b30d-6ffaa47b780a";
const BACKEND_TEAM  = process.env.SEED_BACKEND_TEAM_ID  || "669287f0-53d3-4b13-880c-275b35926a25";
const QA_TEAM       = process.env.SEED_QA_TEAM_ID       || "99b051dd-d4c5-458c-9128-d263e1813491";
const DEVOPS_TEAM   = process.env.SEED_DEVOPS_TEAM_ID   || "0fd43d5e-3dda-4e78-a695-3f633a024feb";

const TABLES = {
  users:    process.env.DDB_USERS_TABLE    || "Users",
  teams:    process.env.DDB_TEAMS_TABLE    || "Teams",
  projects: process.env.DDB_PROJECTS_TABLE || "Projects",
  tasks:    process.env.DDB_TASKS_TABLE    || "Tasks",
  comments: process.env.DDB_COMMENTS_TABLE || "Comments",
};

// Key schemas matching the actual DynamoDB tables
const KEY_SCHEMA: Record<string, string[]> = {
  [TABLES.users]:    ["userId"],
  [TABLES.teams]:    ["teamId"],
  [TABLES.projects]: ["projectId"],
  [TABLES.tasks]:    ["taskId", "projectId"],   // composite
  [TABLES.comments]: ["commentId", "taskId"],   // composite
};

const region = process.env.AWS_REGION || "us-east-1";
const ddb    = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true },
});

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

  // ── Teams (keep existing UUIDs — just refresh the rows) ───────────────────
  console.log("\n📦 Teams...");
  await put(TABLES.teams, { teamId: FRONTEND_TEAM, name: "Frontend", memberIds: [SARA_SUB],  createdAt: now() });
  await put(TABLES.teams, { teamId: BACKEND_TEAM,  name: "Backend",  memberIds: [OMAR_SUB],  createdAt: now() });
  await put(TABLES.teams, { teamId: QA_TEAM,       name: "QA",       memberIds: [],           createdAt: now() });
  await put(TABLES.teams, { teamId: DEVOPS_TEAM,   name: "DevOps",   memberIds: [],           createdAt: now() });

  // ── Users ─────────────────────────────────────────────────────────────────
  console.log("\n👥 Users...");
  await put(TABLES.users, { userId: MANAGER_SUB, email: "ali@demo.com",  name: "Ali",  role: "manager",  teamId: "",           createdAt: now() });
  await put(TABLES.users, { userId: SARA_SUB,    email: "sara@demo.com", name: "Sara", role: "employee", teamId: FRONTEND_TEAM, createdAt: now() });
  await put(TABLES.users, { userId: OMAR_SUB,    email: "omar@demo.com", name: "Omar", role: "employee", teamId: BACKEND_TEAM,  createdAt: now() });

  // ── Projects ──────────────────────────────────────────────────────────────
  console.log("\n📁 Projects...");
  const p1 = uuid();
  const p2 = uuid();
  const p3 = uuid();
  const p4 = uuid();
  await put(TABLES.projects, { projectId: p1, name: "Syncora Web App",       description: "Next.js frontend",              teamId: FRONTEND_TEAM, createdBy: MANAGER_SUB, createdAt: now() });
  await put(TABLES.projects, { projectId: p2, name: "API & Infrastructure",  description: "Express backend + DynamoDB",    teamId: BACKEND_TEAM,  createdBy: MANAGER_SUB, createdAt: now() });
  await put(TABLES.projects, { projectId: p3, name: "Test Automation Suite", description: "E2E and integration tests",      teamId: QA_TEAM,       createdBy: MANAGER_SUB, createdAt: now() });
  await put(TABLES.projects, { projectId: p4, name: "CI/CD Pipeline",        description: "GitHub Actions + EC2 deploys",  teamId: DEVOPS_TEAM,   createdBy: MANAGER_SUB, createdAt: now() });

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
    title,       description, status, priority,
    deadline:    daysFromNow(deadlineOffset),
    createdBy:   MANAGER_SUB,
    createdAt:   daysAgo(createdDaysAgo),
    updatedAt:   status === "Done" ? daysAgo(Math.max(0, createdDaysAgo - 1)) : now(),
  });

  // Sara — Frontend tasks
  const t1 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Implement Kanban drag-and-drop",      "Add drag-and-drop reordering with @dnd-kit",                    "To Do",       "High",   5,  2);
  const t2 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Redesign dashboard stat cards",       "Update icon-based cards to match 4-colour design system",       "In Progress", "Medium", 3,  4);
  const t3 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Fix mobile responsive sidebar",       "Sidebar collapses incorrectly on screens below 768px",          "In Review",   "Low",    7,  6);
  const t4 = mkTask(p1, FRONTEND_TEAM, SARA_SUB, "Dark mode support",                   "CSS variable-based dark mode toggle in globals.css",            "Done",        "Low",    -5, 10);

  // Omar — Backend tasks
  const t5 = mkTask(p2, BACKEND_TEAM, OMAR_SUB, "Migrate auth to Cognito ID tokens",    "Replace access-token validation with ID-token verification",    "To Do",       "High",   2,  1);
  const t6 = mkTask(p2, BACKEND_TEAM, OMAR_SUB, "Add GSI for assigneeId on Tasks",      "Create assigneeId-index GSI in DynamoDB",                       "In Progress", "High",   4,  3);
  const t7 = mkTask(p2, BACKEND_TEAM, OMAR_SUB, "Implement presigned URL upload",       "POST /tasks/:id/image returns a presigned S3 PUT URL",          "Done",        "Medium", -3, 8);

  // Manager-assigned QA tasks (also assigned to Sara for demo since no QA user)
  const t8  = mkTask(p3, QA_TEAM, SARA_SUB, "Write E2E tests for task creation",        "Cover the full manager → create task → assign employee flow",   "To Do",       "High",   6,  1);
  const t9  = mkTask(p3, QA_TEAM, SARA_SUB, "Regression test Kanban transitions",       "Verify To Do → In Progress → In Review → Done rules",           "In Progress", "Medium", 8,  2);

  // DevOps tasks (assigned to Omar)
  const t10 = mkTask(p4, DEVOPS_TEAM, OMAR_SUB, "Set up Auto Scaling Group",            "Launch template, min 2 instances, attach to ALB",              "In Progress", "High",   3,  3);
  const t11 = mkTask(p4, DEVOPS_TEAM, OMAR_SUB, "Configure CloudWatch dashboard",       "4 widgets: tasks/day, closed/day, avg time-to-close, CPU",      "To Do",       "Medium", 10, 0);
  const t12 = mkTask(p4, DEVOPS_TEAM, OMAR_SUB, "Test team isolation (cross-team 403)", "Fetch task with guessed ID from another team — expect 403",     "In Review",   "High",   -1, 5); // overdue

  for (const t of [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11, t12]) {
    await put(TABLES.tasks, t as Record<string, unknown>);
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  console.log("\n💬 Comments...");
  const mkComment = (taskId: string, authorId: string, body: string, daysBack = 0) => ({
    commentId: uuid(), taskId, authorId, body, createdAt: daysAgo(daysBack),
  });

  await put(TABLES.comments, mkComment(t2.taskId, MANAGER_SUB, "Sara, please use the exact hex values from the design system.",        3));
  await put(TABLES.comments, mkComment(t2.taskId, SARA_SUB,    "Done — using CSS variables now. Looks much cleaner.",                  1));
  await put(TABLES.comments, mkComment(t6.taskId, OMAR_SUB,    "GSI created. Provisioned throughput 5R/5W for free tier.",             2));
  await put(TABLES.comments, mkComment(t6.taskId, MANAGER_SUB, "Good. Make sure the query uses the index, not a full scan.",           1));
  await put(TABLES.comments, mkComment(t7.taskId, OMAR_SUB,    "Presigned URL works. Frontend uploads directly to S3.",               5));
  await put(TABLES.comments, mkComment(t10.taskId, OMAR_SUB,   "Both instances healthy in us-east-1a and us-east-1b. ALB passing.",   1));

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
✅ Seed complete!

  Teams    : Frontend, Backend, QA, DevOps
  Users    : Ali (manager), Sara (Frontend), Omar (Backend)
  Projects : 4
  Tasks    : 12  (To Do: 4 | In Progress: 4 | In Review: 2 | Done: 2 — 1 overdue)
  Comments : 6

Demo scenario:
  ali@demo.com  → manager  → sees all 12 tasks
  sara@demo.com → Frontend → sees tasks in Frontend + QA teams (assigned to her)
  omar@demo.com → Backend  → sees tasks in Backend + DevOps teams (assigned to him)
`);
}

main().catch(err => {
  console.error("\n❌ Seed failed:", err.message ?? err);
  process.exit(1);
});
