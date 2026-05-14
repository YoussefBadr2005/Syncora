# Mini-Jira on AWS — Implementation Plan

> **Course:** Software Cloud Computing 2026 | **Dr. John Zaki**
> **Team:** Jessica Ehab · Donia Ali
> **Deadline:** 22 May 2026 at 11:59 PM

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack Decision](#2-tech-stack-decision)
3. [Phase 0 — Setup & Prerequisites](#phase-0--setup--prerequisites)
4. [Phase 1 — AWS Infrastructure Foundation](#phase-1--aws-infrastructure-foundation)
5. [Phase 2 — Authentication (Cognito)](#phase-2--authentication-cognito)
6. [Phase 3 — Backend API (Node.js on EC2)](#phase-3--backend-api-nodejs-on-ec2)
7. [Phase 4 — DynamoDB Schema & Data Layer](#phase-4--dynamodb-schema--data-layer)
8. [Phase 5 — S3 & Lambda Image Pipeline](#phase-5--s3--lambda-image-pipeline)
9. [Phase 6 — Event-Driven Services (SNS + SQS + EventBridge)](#phase-6--event-driven-services-sns--sqs--eventbridge)
10. [Phase 7 — Frontend (Next.js / React)](#phase-7--frontend-nextjs--react)
11. [Phase 8 — CloudWatch Monitoring & Alarms](#phase-8--cloudwatch-monitoring--alarms)
12. [Phase 9 — High Availability Deployment (ALB + ASG + CloudFront)](#phase-9--high-availability-deployment-alb--asg--cloudfront)
13. [Phase 10 — Demo Scenario Validation & Final Polish](#phase-10--demo-scenario-validation--final-polish)
14. [Deliverables Checklist](#deliverables-checklist)
15. [Cost & Free-Tier Guardrails](#cost--free-tier-guardrails)

---

## 1. Project Overview

Mini-Jira is a lightweight, team-scoped task-management system hosted entirely on AWS. It mirrors a stripped-down Jira/Trello with:

- **Role-based access** — Manager, Employee (team-scoped), optional Admin
- **Full CRUD** on Projects, Tasks, and Comments
- **Event-driven architecture** — SNS fan-out → SQS → Worker Lambda → CloudWatch
- **Image pipeline** — S3 upload → Lambda resize → S3 thumbnails
- **High availability** — 2 AZs, ALB, Auto Scaling Group, CloudFront
- **Scheduled digest** — EventBridge daily 9 AM → Daily Digest Lambda → SNS email

---

## 2. Tech Stack Decision

| Layer | Choice | Reason |
|---|---|---|
| Frontend | **Next.js 14 (React)** | SSR + API routes, great DX, works with shadcn/ui |
| Backend | **Node.js + Express** on EC2 | Straightforward REST API, native AWS SDK v3 |
| Database | **DynamoDB** | Required by spec |
| Auth | **AWS Cognito** | Required by spec |
| UI Library | **shadcn/ui + Tailwind CSS** | Required by spec, polished components |
| Language | **TypeScript** throughout | Type safety for both FE and BE |
| Infrastructure | AWS SDK v3 for JavaScript | Required by spec |

> **Folder structure suggestion:**
> ```
> /
> ├── backend/          # Node.js Express API
> ├── frontend/         # Next.js app
> ├── lambdas/
> │   ├── image-resize/
> │   ├── assignment-worker/
> │   └── daily-digest/
> ├── infra/            # AWS CLI setup scripts / notes
> └── README.md
> ```

---

## Phase 0 — Setup & Prerequisites

**Goal:** Everyone on the same environment before writing a single line of application code.

### 0.1 AWS Account & IAM

- [ ] Create an AWS IAM user (do NOT use root) with programmatic access
- [ ] Attach policies: `AdministratorAccess` for dev (tighten to least-privilege before final submission)
- [ ] Save `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` securely
- [ ] Install and configure AWS CLI v2:
  ```bash
  aws configure
  # Region: us-east-1 (or your preferred region)
  ```

### 0.2 Local Dev Environment

- [ ] Install Node.js 20 LTS
- [ ] Install TypeScript globally: `npm i -g typescript ts-node`
- [ ] Install Git and create a private GitHub repository
- [ ] Set up `.env.local` and `.env` files (never commit these — add to `.gitignore`)

### 0.3 GitHub Repository

- [ ] Initialize repo with a `README.md`
- [ ] Create branches: `main` (production), `dev` (development)
- [ ] Add `.gitignore` for `node_modules`, `.env`, `dist/`, `.next/`

---

## Phase 1 — AWS Infrastructure Foundation

**Goal:** VPC, subnets, security groups, and IAM roles that all later phases depend on.

### 1.1 VPC Setup

```
VPC CIDR: 10.0.0.0/16
Region: us-east-1

Availability Zone A (us-east-1a):
  Public Subnet A:  10.0.1.0/24  ← ALB, NAT Gateway
  Private Subnet A: 10.0.3.0/24  ← EC2 instances

Availability Zone B (us-east-1b):
  Public Subnet B:  10.0.2.0/24  ← ALB, NAT Gateway
  Private Subnet B: 10.0.4.0/24  ← EC2 instances
```

- [ ] Create VPC with DNS hostnames enabled
- [ ] Create Internet Gateway and attach to VPC
- [ ] Create 2 public subnets (one per AZ) and 2 private subnets (one per AZ)
- [ ] Create 2 NAT Gateways (one per public subnet) — **use Elastic IPs**
- [ ] Create route tables:
  - Public RT: `0.0.0.0/0 → Internet Gateway`
  - Private RT A: `0.0.0.0/0 → NAT Gateway A`
  - Private RT B: `0.0.0.0/0 → NAT Gateway B`

### 1.2 Security Groups

| Security Group | Inbound Rules | Attached To |
|---|---|---|
| `sg-alb` | 80, 443 from `0.0.0.0/0` | Application Load Balancer |
| `sg-ec2` | 3000 (or your API port) from `sg-alb` only | EC2 instances |
| `sg-lambda` | (no inbound; Lambda is outbound-only) | Lambda functions |

### 1.3 IAM Roles (Least Privilege)

Create the following IAM roles with the minimum policies needed:

**`role-ec2-backend`** (attached to EC2 instances):
- `AmazonDynamoDBFullAccess`
- `AmazonS3FullAccess`
- `AmazonSNSFullAccess`
- `AmazonSQSFullAccess`
- `CloudWatchAgentServerPolicy`
- `AmazonCognitoPowerUser`

**`role-lambda-image-resize`**:
- S3 read on originals bucket + S3 write on resized bucket
- CloudWatch Logs write

**`role-lambda-assignment-worker`**:
- SQS receive/delete messages
- DynamoDB write (activity log table)
- CloudWatch PutMetricData
- CloudWatch Logs write

**`role-lambda-daily-digest`**:
- DynamoDB scan on Tasks table
- SNS publish
- CloudWatch Logs write

---

## Phase 2 — Authentication (Cognito)

**Goal:** Users can sign up, sign in, and receive JWT tokens carrying `role` and `teamId`.

### 2.1 Create Cognito User Pool

```bash
aws cognito-idp create-user-pool \
  --pool-name MiniJiraUserPool \
  --policies '{"PasswordPolicy":{"MinimumLength":8}}' \
  --schema '[
    {"Name":"role","AttributeDataType":"String","Mutable":true},
    {"Name":"teamId","AttributeDataType":"String","Mutable":true}
  ]' \
  --auto-verified-attributes email
```

- [ ] Note the `UserPoolId` output

### 2.2 Create App Client

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id <UserPoolId> \
  --client-name MiniJiraAppClient \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH
```

- [ ] Note the `ClientId` output

### 2.3 Cognito User Attributes Mapping

| Custom Attribute | Values |
|---|---|
| `custom:role` | `"manager"` \| `"employee"` \| `"admin"` |
| `custom:teamId` | e.g., `"team-frontend"` \| `"team-backend"` \| `""` (managers have no team restriction) |

### 2.4 Backend JWT Validation Middleware

Create an Express middleware that:
1. Extracts the `Authorization: Bearer <token>` header
2. Fetches Cognito's JWKS from: `https://cognito-idp.<region>.amazonaws.com/<UserPoolId>/.well-known/jwks.json`
3. Verifies the JWT signature using the public key
4. Attaches `req.user = { sub, email, role, teamId }` to the request

```typescript
// backend/src/middleware/auth.ts
import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: "access",
  clientId: process.env.COGNITO_CLIENT_ID!,
});

export async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const payload = await verifier.verify(token);
    req.user = {
      sub: payload.sub,
      role: payload["custom:role"],
      teamId: payload["custom:teamId"],
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
```

### 2.5 Seed Demo Users via AWS CLI

```bash
# Create manager Ali
aws cognito-idp admin-create-user --user-pool-id <id> --username ali \
  --user-attributes Name=email,Value=ali@demo.com \
    Name=custom:role,Value=manager Name=custom:teamId,Value=""

# Create employee Sara (Frontend team)
aws cognito-idp admin-create-user --user-pool-id <id> --username sara \
  --user-attributes Name=email,Value=sara@demo.com \
    Name=custom:role,Value=employee Name=custom:teamId,Value="team-frontend"

# Create employee Omar (Backend team)
aws cognito-idp admin-create-user --user-pool-id <id> --username omar \
  --user-attributes Name=email,Value=omar@demo.com \
    Name=custom:role,Value=employee Name=custom:teamId,Value="team-backend"
```

---

## Phase 3 — Backend API (Node.js on EC2)

**Goal:** A working REST API with role enforcement and team isolation, deployable to EC2.

### 3.1 Project Initialization

```bash
mkdir backend && cd backend
npm init -y
npm install express cors dotenv aws-jwt-verify @aws-sdk/client-dynamodb \
  @aws-sdk/lib-dynamodb @aws-sdk/client-s3 @aws-sdk/client-sns \
  @aws-sdk/client-sqs @aws-sdk/client-cloudwatch multer uuid
npm install -D typescript @types/express @types/node ts-node nodemon
```

### 3.2 API Routes

#### Projects

| Method | Route | Access |
|---|---|---|
| `POST` | `/api/projects` | Manager only |
| `GET` | `/api/projects` | Manager (all), Employee (own team's projects) |
| `GET` | `/api/projects/:id` | Role-checked |
| `PUT` | `/api/projects/:id` | Manager only |
| `DELETE` | `/api/projects/:id` | Manager only |

#### Tasks

| Method | Route | Access |
|---|---|---|
| `POST` | `/api/tasks` | Manager only |
| `GET` | `/api/tasks` | Manager (all), Employee (team-filtered by `teamId` from JWT) |
| `GET` | `/api/tasks/:id` | Team-checked server-side |
| `PUT` | `/api/tasks/:id` | Manager (any field), Employee (status only, own team) |
| `DELETE` | `/api/tasks/:id` | Manager only |

#### Comments

| Method | Route | Access |
|---|---|---|
| `POST` | `/api/tasks/:id/comments` | Manager or task's team member |
| `GET` | `/api/tasks/:id/comments` | Same team-check as task |

#### Images

| Method | Route | Access |
|---|---|---|
| `POST` | `/api/tasks/:id/image` | Manager or task's team member |
| `DELETE` | `/api/tasks/:id/image` | Manager only |

#### Teams & Users (Admin/Manager)

| Method | Route | Access |
|---|---|---|
| `POST` | `/api/teams` | Manager/Admin |
| `GET` | `/api/teams` | Manager/Admin |
| `POST` | `/api/teams/:id/members` | Manager/Admin |

### 3.3 Team Isolation Enforcement

**This is critical.** Every task query must enforce team isolation at the API layer, not just in the UI.

```typescript
// backend/src/middleware/teamGuard.ts
export function enforceTeamAccess(req, res, next) {
  if (req.user.role === "manager") return next(); // managers bypass

  // For employees, inject their teamId into the query params
  req.teamId = req.user.teamId;
  next();
}
```

All task fetch handlers must use the `teamId` GSI when the requester is an employee:

```typescript
// When employee fetches tasks:
const command = new QueryCommand({
  TableName: "Tasks",
  IndexName: "teamId-index",
  KeyConditionExpression: "teamId = :tid",
  ExpressionAttributeValues: { ":tid": req.teamId },
});
```

### 3.4 Status Audit Log

Every status change writes to a `StatusLogs` DynamoDB table:

```typescript
await dynamo.put({
  TableName: "StatusLogs",
  Item: {
    logId: uuid(),
    taskId,
    fromStatus,
    toStatus,
    changedBy: req.user.sub,
    changedAt: new Date().toISOString(),
  },
});
```

### 3.5 EC2 Setup Script (`user-data.sh`)

```bash
#!/bin/bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
npm install -g pm2

git clone https://github.com/<your-repo>.git /app
cd /app/backend
npm install
npm run build

pm2 start dist/index.js --name mini-jira-api
pm2 startup
pm2 save
```

---

## Phase 4 — DynamoDB Schema & Data Layer

**Goal:** All tables created with correct primary keys and GSIs.

### 4.1 Table Definitions

#### `Users`
| Attribute | Type | Key |
|---|---|---|
| `userId` (= Cognito sub) | String | PK |
| `email` | String | |
| `role` | String | |
| `teamId` | String | |
| `name` | String | |

#### `Teams`
| Attribute | Type | Key |
|---|---|---|
| `teamId` | String | PK |
| `name` | String | |
| `memberIds` | List | |

#### `Projects`
| Attribute | Type | Key |
|---|---|---|
| `projectId` | String | PK |
| `name` | String | |
| `description` | String | |
| `createdBy` | String | |
| `createdAt` | String | |
| `teamId` | String | GSI PK |

#### `Tasks`
| Attribute | Type | Key |
|---|---|---|
| `taskId` | String | PK |
| `projectId` | String | SK |
| `title` | String | |
| `description` | String | |
| `status` | String | `"To Do"` \| `"In Progress"` \| `"In Review"` \| `"Done"` |
| `priority` | String | `"Low"` \| `"Medium"` \| `"High"` |
| `deadline` | String | ISO date |
| `assigneeId` | String | GSI PK (`assigneeId-index`) |
| `teamId` | String | GSI PK (`teamId-index`) |
| `imageKey` | String | S3 key for original |
| `thumbnailKey` | String | S3 key for resized thumbnail |
| `createdBy` | String | |
| `createdAt` | String | |
| `updatedAt` | String | |

> ⚠️ **Both GSIs are required by the spec.**

#### `Comments`
| Attribute | Type | Key |
|---|---|---|
| `commentId` | String | PK |
| `taskId` | String | SK (also GSI PK for `taskId-index`) |
| `authorId` | String | |
| `body` | String | |
| `createdAt` | String | |

#### `ActivityLogs`
| Attribute | Type | Key |
|---|---|---|
| `logId` | String | PK |
| `taskId` | String | |
| `type` | String | `"assignment"` \| `"status_change"` |
| `payload` | Map | |
| `createdAt` | String | |

#### `StatusLogs`
| Attribute | Type | Key |
|---|---|---|
| `logId` | String | PK |
| `taskId` | String | |
| `fromStatus` | String | |
| `toStatus` | String | |
| `changedBy` | String | |
| `changedAt` | String | |

### 4.2 Create Tables via AWS CLI

```bash
# Tasks table with two GSIs
aws dynamodb create-table \
  --table-name Tasks \
  --attribute-definitions \
    AttributeName=taskId,AttributeType=S \
    AttributeName=projectId,AttributeType=S \
    AttributeName=teamId,AttributeType=S \
    AttributeName=assigneeId,AttributeType=S \
  --key-schema \
    AttributeName=taskId,KeyType=HASH \
    AttributeName=projectId,KeyType=RANGE \
  --global-secondary-indexes \
    '[
      {"IndexName":"teamId-index","KeySchema":[{"AttributeName":"teamId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"},"ProvisionedThroughput":{"ReadCapacityUnits":5,"WriteCapacityUnits":5}},
      {"IndexName":"assigneeId-index","KeySchema":[{"AttributeName":"assigneeId","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"},"ProvisionedThroughput":{"ReadCapacityUnits":5,"WriteCapacityUnits":5}}
    ]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
```

> Repeat for Users, Teams, Projects, Comments, ActivityLogs, and StatusLogs.

---

## Phase 5 — S3 & Lambda Image Pipeline

**Goal:** Images uploaded by users are stored in S3 and auto-resized by Lambda.

### 5.1 Create S3 Buckets

```bash
# Originals bucket (versioning enabled to retain old images)
aws s3api create-bucket --bucket mini-jira-originals-<unique-id> --region us-east-1
aws s3api put-bucket-versioning --bucket mini-jira-originals-<unique-id> \
  --versioning-configuration Status=Enabled

# Resized thumbnails bucket
aws s3api create-bucket --bucket mini-jira-resized-<unique-id> --region us-east-1
```

- [ ] Add CORS configuration to originals bucket to allow frontend uploads
- [ ] Block public access on both buckets (serve via pre-signed URLs or CloudFront)

### 5.2 Pre-Signed URL Upload Flow

The backend generates a pre-signed URL — the frontend uploads directly to S3 (never through the backend server):

```typescript
// backend: generate pre-signed upload URL
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: "us-east-1" });

export async function getUploadUrl(taskId: string, filename: string) {
  const key = `tasks/${taskId}/originals/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: process.env.S3_ORIGINALS_BUCKET,
    Key: key,
    ContentType: "image/jpeg",
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { url, key };
}
```

### 5.3 Lambda — Image Resize

**Trigger:** S3 PUT event on the originals bucket (only on `tasks/*/originals/*` prefix)

```typescript
// lambdas/image-resize/index.ts
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp"; // bundled in Lambda layer or as dependency

export const handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key);

    // Only process originals, not already-resized images
    if (!key.includes("/originals/")) return;

    const s3 = new S3Client({});
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buffer = Buffer.from(await Body.transformToByteArray());

    const resized = await sharp(buffer).resize(300, 300, { fit: "inside" }).jpeg().toBuffer();

    const thumbnailKey = key.replace("/originals/", "/thumbnails/");
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_RESIZED_BUCKET,
      Key: thumbnailKey,
      Body: resized,
      ContentType: "image/jpeg",
    }));

    console.log(`Resized ${key} → ${thumbnailKey}`);
  }
};
```

**Deploy Lambda:**
```bash
cd lambdas/image-resize
npm install
zip -r function.zip .
aws lambda create-function \
  --function-name ImageResizeLambda \
  --runtime nodejs20.x \
  --role arn:aws:iam::<account>:role/role-lambda-image-resize \
  --handler index.handler \
  --zip-file fileb://function.zip \
  --environment Variables="{S3_RESIZED_BUCKET=mini-jira-resized-<id>}"
```

**Add S3 trigger:**
```bash
aws lambda add-permission \
  --function-name ImageResizeLambda \
  --action lambda:InvokeFunction \
  --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::mini-jira-originals-<id> \
  --statement-id s3-trigger

aws s3api put-bucket-notification-configuration \
  --bucket mini-jira-originals-<id> \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [{
      "LambdaFunctionArn": "arn:aws:lambda:us-east-1:<account>:function:ImageResizeLambda",
      "Events": ["s3:ObjectCreated:Put"],
      "Filter": {"Key": {"FilterRules": [{"Name": "prefix","Value": "tasks/"},{"Name": "suffix","Value": ".jpg"}]}}
    }]
  }'
```

- [ ] After upload, update the task's `thumbnailKey` in DynamoDB (via a callback or polling mechanism)

---

## Phase 6 — Event-Driven Services (SNS + SQS + EventBridge)

**Goal:** Task assignment triggers email notification + SQS worker; daily digest runs at 9 AM.

### 6.1 Create SNS Topic

```bash
aws sns create-topic --name TaskAssignmentTopic
# Note the TopicArn

# Subscribe manager/employee email for demo
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:<account>:TaskAssignmentTopic \
  --protocol email \
  --notification-endpoint assignee@demo.com
```

### 6.2 Create SQS Queue

```bash
aws sqs create-queue --queue-name TaskAssignmentQueue
# Note the QueueUrl and QueueArn

# Subscribe SQS to SNS
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:<account>:TaskAssignmentTopic \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:<account>:TaskAssignmentQueue
```

> Allow SNS to send messages to SQS by adding the appropriate SQS access policy.

### 6.3 Publish to SNS on Task Assignment (Backend)

```typescript
// In POST /api/tasks handler, after saving to DynamoDB:
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({ region: "us-east-1" });

await sns.send(new PublishCommand({
  TopicArn: process.env.SNS_TASK_ASSIGNMENT_TOPIC,
  Message: JSON.stringify({
    taskId,
    taskTitle,
    assigneeId,
    assigneeName,
    teamId,
    assignedBy: req.user.sub,
    assignedAt: new Date().toISOString(),
  }),
  Subject: `New Task Assigned: ${taskTitle}`,
}));
```

### 6.4 Lambda — Assignment Worker

**Trigger:** SQS queue (`TaskAssignmentQueue`)

```typescript
// lambdas/assignment-worker/index.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

export const handler = async (event) => {
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const cw = new CloudWatchClient({});

  for (const record of event.Records) {
    const body = JSON.parse(JSON.parse(record.body).Message);

    // Write activity log
    await dynamo.send(new PutCommand({
      TableName: "ActivityLogs",
      Item: {
        logId: crypto.randomUUID(),
        taskId: body.taskId,
        type: "assignment",
        payload: body,
        createdAt: new Date().toISOString(),
      },
    }));

    // Publish custom CloudWatch metric: TasksAssignedPerTeam
    await cw.send(new PutMetricDataCommand({
      Namespace: "MiniJira",
      MetricData: [{
        MetricName: "TasksAssigned",
        Dimensions: [{ Name: "TeamId", Value: body.teamId }],
        Value: 1,
        Unit: "Count",
      }],
    }));
  }
};
```

### 6.5 Lambda — Daily Digest

**Trigger:** EventBridge scheduled rule — `cron(0 9 * * ? *)`

```typescript
// lambdas/daily-digest/index.ts
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

export const handler = async () => {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const sns = new SNSClient({});

  // Scan for tasks due today (in production, use a GSI on deadline)
  const { Items } = await dynamo.send(new ScanCommand({
    TableName: "Tasks",
    FilterExpression: "begins_with(deadline, :today) AND #s <> :done",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":today": today, ":done": "Done" },
  }));

  if (!Items?.length) return;

  // Group by assignee
  const byAssignee = Items.reduce((acc, task) => {
    acc[task.assigneeId] = acc[task.assigneeId] || [];
    acc[task.assigneeId].push(task.title);
    return acc;
  }, {});

  for (const [assigneeId, tasks] of Object.entries(byAssignee)) {
    await sns.send(new PublishCommand({
      TopicArn: process.env.SNS_DIGEST_TOPIC,
      Message: `Daily Digest: You have ${(tasks as string[]).length} task(s) due today:\n${(tasks as string[]).join("\n")}`,
      Subject: "Mini-Jira Daily Task Digest",
    }));
  }
};
```

**Create EventBridge rule:**
```bash
aws events put-rule \
  --name DailyDigestRule \
  --schedule-expression "cron(0 9 * * ? *)" \
  --state ENABLED

aws events put-targets \
  --rule DailyDigestRule \
  --targets '[{"Id":"1","Arn":"arn:aws:lambda:us-east-1:<account>:function:DailyDigestLambda"}]'

aws lambda add-permission \
  --function-name DailyDigestLambda \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:<account>:rule/DailyDigestRule \
  --statement-id eventbridge-trigger
```

---

## Phase 7 — Frontend (Next.js / React)

**Goal:** Polished UI with Kanban board, task modals, role-aware views, and drag-and-drop.

### 7.1 Project Setup

```bash
npx create-next-app@latest frontend --typescript --tailwind --app
cd frontend
npx shadcn@latest init
npx shadcn@latest add button card dialog badge input label select textarea toast
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install amazon-cognito-identity-js @aws-amplify/auth
```

### 7.2 Pages & Routes

```
/                        → Redirect to /login or /dashboard
/login                   → Cognito sign-in form
/dashboard               → Kanban board (filtered by role)
/projects                → Project list (Manager: all, Employee: team-only)
/projects/[id]           → Project detail + task list
/tasks/[id]              → Task detail modal view
/admin/teams             → Team management (Manager/Admin only)
/admin/users             → User management (Manager/Admin only)
```

### 7.3 Auth Context

```typescript
// frontend/src/context/AuthContext.tsx
// Wrap the app with Amplify Auth
// On every API call, attach Authorization: Bearer <accessToken>
// Decode JWT to get role and teamId for client-side UI decisions
// IMPORTANT: role-based UI is cosmetic only — the backend enforces real access
```

### 7.4 Kanban Board Component

```typescript
// frontend/src/components/KanbanBoard.tsx
// Columns: ["To Do", "In Progress", "In Review", "Done"]
// Each column renders TaskCard components
// Uses @dnd-kit for drag-and-drop
// On drop → PATCH /api/tasks/:id with { status: newColumn }
// Manager sees all cards; Employee sees only their team's
```

### 7.5 Key UI Components

- **`TaskCard`** — title, priority badge (color-coded), assignee avatar, deadline, drag handle
- **`TaskDetailModal`** — full task info, status update (Employee), comment thread, image preview (thumbnail from S3), audit log
- **`CreateTaskModal`** — Manager-only form: title, description, priority, deadline, assignee dropdown (fetched from Users table), team selector, image upload
- **`TeamFilter`** — Manager-only dropdown to filter the board by team
- **`NotificationToast`** — success/error feedback on every action
- **`LoadingSpinner` / `EmptyState`** — for all async states

### 7.6 Image Display

```typescript
// Use pre-signed GET URLs for displaying images securely
const response = await fetch(`/api/tasks/${taskId}/image-url`);
const { url } = await response.json();
// url is a pre-signed S3 URL valid for 15 minutes
<img src={url} alt="Task attachment" />
```

### 7.7 Frontend Environment Variables

```env
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxx
NEXT_PUBLIC_API_URL=https://<CloudFront-URL>/api
```

---

## Phase 8 — CloudWatch Monitoring & Alarms

**Goal:** Dashboard with 4 widgets and at least 1 alarm.

### 8.1 Custom Metrics Published By

| Source | Metric | Namespace |
|---|---|---|
| Assignment Worker Lambda | `TasksAssigned` (dim: `TeamId`) | `MiniJira` |
| Backend API (on task close) | `TasksClosed` (dim: `TeamId`) | `MiniJira` |
| Backend API (on task create) | `TasksCreated` | `MiniJira` |
| Backend API (on task close) | `TimeToClose` (seconds) | `MiniJira` |

### 8.2 CloudWatch Dashboard — 4 Required Widgets

```bash
aws cloudwatch put-dashboard \
  --dashboard-name MiniJiraDashboard \
  --dashboard-body '{
    "widgets": [
      {
        "type": "metric", "x": 0, "y": 0, "width": 12, "height": 6,
        "properties": {
          "title": "Tasks Created Per Day",
          "metrics": [["MiniJira", "TasksCreated"]],
          "period": 86400, "stat": "Sum", "view": "timeSeries"
        }
      },
      {
        "type": "metric", "x": 12, "y": 0, "width": 12, "height": 6,
        "properties": {
          "title": "Tasks Closed Per Day Per Team",
          "metrics": [
            ["MiniJira", "TasksClosed", "TeamId", "team-frontend"],
            ["MiniJira", "TasksClosed", "TeamId", "team-backend"]
          ],
          "period": 86400, "stat": "Sum", "view": "timeSeries"
        }
      },
      {
        "type": "metric", "x": 0, "y": 6, "width": 12, "height": 6,
        "properties": {
          "title": "Average Time To Close (seconds)",
          "metrics": [["MiniJira", "TimeToClose"]],
          "period": 86400, "stat": "Average", "view": "timeSeries"
        }
      },
      {
        "type": "metric", "x": 12, "y": 6, "width": 12, "height": 6,
        "properties": {
          "title": "EC2 CPU Utilization",
          "metrics": [["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", "MiniJiraASG"]],
          "period": 300, "stat": "Average", "view": "timeSeries"
        }
      }
    ]
  }'
```

### 8.3 CloudWatch Alarm — Overdue Tasks

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name OverdueTasksAlarm \
  --alarm-description "Triggers when overdue tasks exceed 10" \
  --metric-name OverdueTasks \
  --namespace MiniJira \
  --statistic Sum \
  --period 3600 \
  --threshold 10 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:<account>:TaskAssignmentTopic
```

> The backend should publish an `OverdueTasks` metric periodically (e.g., via a cron job or on each task fetch).

---

## Phase 9 — High Availability Deployment (ALB + ASG + CloudFront)

**Goal:** The app runs across 2 AZs behind an ALB, served globally via CloudFront.

### 9.1 Create EC2 Launch Template

```bash
aws ec2 create-launch-template \
  --launch-template-name MiniJiraLT \
  --launch-template-data '{
    "ImageId": "ami-0c02fb55956c7d316",
    "InstanceType": "t2.micro",
    "IamInstanceProfile": {"Name": "role-ec2-backend"},
    "SecurityGroupIds": ["sg-xxxxxxxx"],
    "UserData": "<base64-encoded-user-data.sh>",
    "TagSpecifications": [{
      "ResourceType": "instance",
      "Tags": [{"Key": "Name","Value": "MiniJira-Backend"}]
    }]
  }'
```

### 9.2 Create Application Load Balancer

```bash
# Create ALB
aws elbv2 create-load-balancer \
  --name MiniJiraALB \
  --subnets <public-subnet-a-id> <public-subnet-b-id> \
  --security-groups sg-alb-id \
  --scheme internet-facing \
  --type application

# Create Target Group
aws elbv2 create-target-group \
  --name MiniJiraTG \
  --protocol HTTP --port 3000 \
  --vpc-id <vpc-id> \
  --health-check-path /api/health \
  --health-check-interval-seconds 30

# Create Listener
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=<tg-arn>
```

> Add a `/api/health` route in your Express API that returns `200 OK`.

### 9.3 Create Auto Scaling Group

```bash
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name MiniJiraASG \
  --launch-template LaunchTemplateName=MiniJiraLT,Version='$Latest' \
  --min-size 2 --max-size 4 --desired-capacity 2 \
  --vpc-zone-identifier "<private-subnet-a-id>,<private-subnet-b-id>" \
  --target-group-arns <tg-arn> \
  --health-check-type ELB \
  --health-check-grace-period 300
```

### 9.4 CloudFront Distribution

```bash
aws cloudfront create-distribution \
  --distribution-config '{
    "Origins": {
      "Quantity": 1,
      "Items": [{
        "Id": "ALBOrigin",
        "DomainName": "<alb-dns-name>",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "OriginProtocolPolicy": "http-only"
        }
      }]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "ALBOrigin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "AllowedMethods": {
        "Quantity": 7,
        "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
        "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}
      },
      "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
      "ForwardedValues": {
        "QueryString": true,
        "Cookies": {"Forward": "all"},
        "Headers": {"Quantity": 1, "Items": ["Authorization"]}
      }
    },
    "Enabled": true,
    "Comment": "Mini-Jira CloudFront Distribution"
  }'
```

> ⚠️ CloudFront caches GET responses by default — set `Cache-Control: no-store` on API responses, or use a **CachingDisabled** managed policy for API paths.

---

## Phase 10 — Demo Scenario Validation & Final Polish

**Goal:** The exact demo scenario from the spec works flawlessly on demo day.

### 10.1 Demo Scenario Checklist

- [ ] Log in as **Manager Ali** → create **Task A**, assign to **Sara** (Frontend team)
- [ ] Verify SNS email notification is received by Sara
- [ ] Log in as **Employee Sara** → confirm she sees **only Task A** (not Task B)
- [ ] Try to fetch Task B by ID as Sara → should get `403 Forbidden`
- [ ] Create **Task B**, assign to **Omar** (Backend team)
- [ ] Log in as **Employee Omar** → confirm he sees **only Task B**
- [ ] Log back in as **Manager Ali** → confirm he sees **both tasks**
- [ ] Demonstrate Ali filtering by team → Frontend shows Task A, Backend shows Task B
- [ ] Sara updates Task A status: `To Do → In Progress → In Review`
- [ ] Ali moves Task A to `Done` → confirm CloudWatch `TasksClosed` metric increments
- [ ] Upload an image to a task → confirm thumbnail appears (Lambda resize worked)
- [ ] Check CloudWatch dashboard shows data in all 4 widgets
- [ ] Verify the CloudFront URL opens the live app directly (no extra config)

### 10.2 Final README.md Must Include

```markdown
## Architecture Diagram
[Link to diagram or embed image]

## Live Application
[CloudFront URL]

## Demo Video
[Link to video]

## Setup Instructions
...
```

### 10.3 Pre-Demo Checklist

- [ ] All EC2 instances are **running** (not stopped or terminated)
- [ ] All Lambda functions deployed and tested
- [ ] Cognito demo users created and verified
- [ ] DynamoDB tables populated with seed data
- [ ] CloudFront distribution deployed and returning `200`
- [ ] CloudWatch dashboard has real data (not empty)
- [ ] SNS email subscriptions confirmed (check spam folder)
- [ ] Architecture diagram uses AWS standard icons
- [ ] GitHub repo is clean — no `.env` files, no secrets committed
- [ ] Submission form filled at the provided Google Forms link

---

## Deliverables Checklist

| Deliverable | Status |
|---|---|
| GitHub Repository (public link) | ☐ |
| Architecture diagram (AWS standard icons, 2 AZs shown) | ☐ |
| Live CloudFront URL (opens app directly) | ☐ |
| Demo video | ☐ |
| README.md with all of the above | ☐ |
| Google Form submitted | ☐ |

---

## Cost & Free-Tier Guardrails

| Service | Free Tier Limit | Action |
|---|---|---|
| EC2 `t2.micro` | 750 hrs/month | **Stop instances when not actively working.** 2 instances = 375 hrs each — monitor carefully |
| EBS | 30 GB | Keep each instance volume ≤ 15 GB |
| ALB | 750 hrs/month | Stop ALB when not in use if possible (note: ALB doesn't have a "stop" — terminate and recreate if needed) |
| DynamoDB | 25 GB storage, 25 WCU/RCU | Provisioned throughput at 5 WCU/5 RCU per table is safe |
| S3 | 5 GB, 20K GET, 2K PUT | Keep test uploads small and few |
| Lambda | 1M requests, 400K GB-seconds | Easily within free tier for this project |
| CloudFront | 1 TB data, 10M requests | Fine for demo traffic |
| SNS | 1M publishes | Fine for demo |
| SQS | 1M requests | Fine for demo |
| Cognito | 50K MAU | Fine |
| NAT Gateway | **NOT in free tier** — ~$0.045/hr per gateway | Only enable during active dev/demo; consider using a NAT instance (t2.micro) instead to stay free |

> 🛑 **After submission: STOP instances, do NOT terminate them.**

---

*Last updated: May 2026*
