# Syncora on AWS — System Architecture & Reference

> **Course:** Software Cloud Computing 2026 | Dr. John Zaki
> **Region:** us-east-1 (N. Virginia)
> **Account:** 586337032787

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Network Architecture (VPC)](#2-network-architecture-vpc)
3. [Security Groups](#3-security-groups)
4. [Compute — EC2 + Auto Scaling](#4-compute--ec2--auto-scaling)
5. [Content Delivery — ALB + CloudFront](#5-content-delivery--alb--cloudfront)
6. [Authentication — Cognito](#6-authentication--cognito)
7. [Database — DynamoDB](#7-database--dynamodb)
8. [Object Storage — S3](#8-object-storage--s3)
9. [Serverless — Lambda Functions](#9-serverless--lambda-functions)
10. [Event-Driven Services — SNS + SQS + EventBridge](#10-event-driven-services--sns--sqs--eventbridge)
11. [Monitoring — CloudWatch](#11-monitoring--cloudwatch)
12. [IAM Roles](#12-iam-roles)
13. [Request Flow — End to End](#13-request-flow--end-to-end)
14. [Demo Scenario Flow](#14-demo-scenario-flow)
15. [Cost & Free Tier Notes](#15-cost--free-tier-notes)
16. [Resource ID Reference](#16-resource-id-reference)

---

## 1. System Overview

Mini-Jira is a team-scoped task management system hosted entirely on AWS. It mirrors a stripped-down Jira/Trello with role-based access, full CRUD on projects/tasks/comments, an image pipeline, event-driven notifications, and a high-availability multi-AZ deployment.

```
Internet
    │
    ▼
CloudFront (CDN)
    │
    ▼
Application Load Balancer  ←── public subnets (us-east-1a, us-east-1b)
    │
    ├──► EC2 instance (us-east-1a, private subnet)
    └──► EC2 instance (us-east-1b, private subnet)
              │
              ├──► DynamoDB  (via VPC Gateway Endpoint — free, no NAT)
              ├──► S3        (via VPC Gateway Endpoint — free, no NAT)
              ├──► SNS       (via NAT Gateway → internet)
              └──► Cognito   (token verification — JWKS fetch via NAT)

S3 originals bucket
    │  PUT event
    ▼
Lambda: ImageResize ──► S3 resized bucket

SNS TaskAssignmentTopic
    ├──► Email subscription  (assignee notification)
    └──► SQS TaskAssignmentQueue
              │
              ▼
         Lambda: AssignmentWorker
              ├──► DynamoDB ActivityLogs (write)
              └──► CloudWatch PutMetricData

EventBridge (cron 9 AM daily)
    └──► Lambda: DailyDigest
              ├──► DynamoDB Tasks (scan due today)
              └──► SNS DailyDigestTopic ──► Email
```

---

## 2. Network Architecture (VPC)

### VPC

| Property | Value |
|---|---|
| VPC ID | `vpc-0a4433d6a02ee46da` |
| CIDR | `10.0.0.0/16` |
| DNS Hostnames | Enabled |
| DNS Support | Enabled |

### Subnets

| Name | ID | AZ | CIDR | Type | Hosts |
|---|---|---|---|---|---|
| Syncora-Public-A | `subnet-0ed61af225d0e8ffc` | us-east-1a | 10.0.1.0/24 | Public | ALB |
| Syncora-Public-B | `subnet-02cce912131fb6e90` | us-east-1b | 10.0.2.0/24 | Public | ALB |
| Syncora-Private-A | `subnet-021df78d783a303c9` | us-east-1a | 10.0.3.0/24 | Private | EC2 |
| Syncora-Private-B | `subnet-028c4bb9b22b2e92e` | us-east-1b | 10.0.4.0/24 | Private | EC2 |

### Internet & NAT Gateways

| Resource | ID | Notes |
|---|---|---|
| Internet Gateway | `igw-05c255805c8a53c76` | Attached to VPC. Enables public subnet internet access. |
| NAT Gateway A | `nat-0f77f565fc8df3a96` | In Public-A. Single NAT shared by both private subnets (cost-optimised). |
| Elastic IP | Attached to NAT-A | Released when project ends to stop charges. |

> **Why single NAT?** Two NAT Gateways would provide AZ-level egress HA but cost ~$64/month. For a course project the tradeoff is clear — EC2 instances still run in both AZs (compute HA is intact), only outbound internet from the private subnets loses redundancy.

### Route Tables

| Name | ID | Routes |
|---|---|---|
| Syncora-RT-Public | `rtb-01ee42f7f978bd8f6` | `0.0.0.0/0 → IGW`. Associated with Public-A and Public-B. |
| Syncora-RT-Private-A | `rtb-05d75683d0a417a34` | `0.0.0.0/0 → NAT-A`. Associated with Private-A. |
| Syncora-RT-Private-B | `rtb-0e531a94eccf25e96` | `0.0.0.0/0 → NAT-A`. Associated with Private-B. |

### VPC Gateway Endpoints (free)

| Service | Type | Benefit |
|---|---|---|
| `com.amazonaws.us-east-1.s3` | Gateway | EC2 → S3 traffic never leaves AWS network. No NAT cost. |
| `com.amazonaws.us-east-1.dynamodb` | Gateway | EC2 → DynamoDB traffic never leaves AWS network. No NAT cost. |

Both endpoints are attached to the two private route tables so all DynamoDB and S3 calls from EC2 are routed privately.

---

## 3. Security Groups

### sg-alb — Application Load Balancer

| Direction | Protocol | Port | Source | Purpose |
|---|---|---|---|---|
| Inbound | TCP | 80 | 0.0.0.0/0 | HTTP from internet |
| Inbound | TCP | 443 | 0.0.0.0/0 | HTTPS from internet |
| Outbound | All | All | 0.0.0.0/0 | Forward to EC2 |

ID: `sg-029eea3f3fd2b9bd7`

### sg-ec2 — EC2 Backend Instances

| Direction | Protocol | Port | Source | Purpose |
|---|---|---|---|---|
| Inbound | TCP | 3000 | `sg-alb` only | API traffic from ALB only — no direct internet access |
| Outbound | All | All | 0.0.0.0/0 | DynamoDB, S3, SNS, Cognito |

ID: `sg-0c94420f19b9755a0`

> The EC2 SG references the ALB SG ID (not a CIDR), so only traffic originating from the ALB can reach port 3000. This is the correct HA pattern — not `0.0.0.0/0`.

---

## 4. Compute — EC2 + Auto Scaling

EC2 instances run the Node.js + Express backend. They live in the **private subnets** and are managed by an Auto Scaling Group.

### Launch Template

| Property | Value |
|---|---|
| Name | `MiniJiraLT` |
| AMI | Amazon Linux 2023 (latest in us-east-1) |
| Instance type | `t2.micro` (free tier) |
| IAM Instance Profile | `Syncora-role-ec2-backend` |
| Security Group | `sg-ec2` |
| User Data | Installs Node 20, clones repo, builds, starts with PM2 |

### Auto Scaling Group

| Property | Value |
|---|---|
| Name | `MiniJiraASG` |
| Min | 2 |
| Max | 4 |
| Desired | 2 |
| Subnets | Private-A (`us-east-1a`) + Private-B (`us-east-1b`) |
| Health check | ELB (ALB health check on `/api/health`) |
| Scale-out trigger | CPU > 70% for 2 consecutive 5-min periods |

> Two instances minimum ensures the app survives a single AZ failure — the spec's high-availability requirement.

---

## 5. Content Delivery — ALB + CloudFront

### Application Load Balancer

| Property | Value |
|---|---|
| Name | `MiniJiraALB` |
| Scheme | Internet-facing |
| Subnets | Public-A + Public-B |
| Security Group | `sg-alb` |
| Listener | HTTP:80 → forward to target group |
| Target Group | `MiniJiraTG` — HTTP:3000, health check `/api/health` |

### CloudFront Distribution

| Property | Value |
|---|---|
| Origin | ALB DNS name |
| Viewer protocol | Redirect HTTP → HTTPS |
| Allowed methods | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE |
| Cache policy | CachingDisabled for `/api/*` paths (API must not be cached) |
| Forwarded headers | `Authorization` (required for Cognito JWT to reach backend) |

> CloudFront sits in front of the ALB for two reasons: (1) HTTPS termination without buying a certificate for the ALB, (2) CDN caching for static frontend assets served from the same origin.

---

## 6. Authentication — Cognito

### User Pool

| Property | Value |
|---|---|
| Pool Name | `SyncoraUserPool` |
| Pool ID | `us-east-1_KZdyQQ1vY` |
| Username attribute | Email (sign in with email address) |
| Auto-verified attributes | Email |
| Custom attributes | `custom:role`, `custom:teamId` |

### App Client

| Property | Value |
|---|---|
| Client Name | `SyncoraAppClient` |
| Client ID | `6fa6pngmmdgasft7hio67r0lh0` |
| Client secret | None (public client) |
| Auth flows | `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |

### Custom Attributes

| Attribute | Type | Values |
|---|---|---|
| `custom:role` | String | `"manager"` \| `"employee"` \| `"admin"` |
| `custom:teamId` | String | `"team-frontend"` \| `"team-backend"` \| `""` (manager = no restriction) |

### Demo Users

| Email | Password | Role | Team |
|---|---|---|---|
| ali@demo.com | Manager123! | manager | — |
| sara@demo.com | Employee123! | employee | team-frontend |
| omar@demo.com | Employee123! | employee | team-backend |

### JWT Validation Flow

Every API request (except `GET /api/health`) goes through this middleware:

```
Request → authMiddleware
  1. Extract Bearer token from Authorization header
  2. CognitoJwtVerifier.verify(token)  ← fetches JWKS from Cognito, verifies signature
  3. Attach req.user = { sub, email, role, teamId }
  4. next()

→ enforceTeamAccess
  if manager/admin → pass through (sees everything)
  if employee      → inject req.teamId = user.teamId (all queries scoped to it)
```

---

## 7. Database — DynamoDB

All tables use **PAY_PER_REQUEST** billing (on-demand). No capacity planning needed. Free tier covers 25 GB storage and the low request volume of a demo project.

### Users

Stores a local copy of user profile data mirroring Cognito attributes.

| Attribute | Type | Key |
|---|---|---|
| `userId` | String | **PK** (= Cognito `sub`) |
| `email` | String | |
| `role` | String | `"manager"` \| `"employee"` \| `"admin"` |
| `teamId` | String | |
| `name` | String | |
| `createdAt` | String | ISO 8601 |

### Teams

| Attribute | Type | Key |
|---|---|---|
| `teamId` | String | **PK** |
| `name` | String | e.g., `"Frontend"`, `"Backend"` |
| `memberIds` | List | User IDs in this team |
| `createdAt` | String | ISO 8601 |

**Seeded records:** `team-frontend` (Frontend), `team-backend` (Backend)

### Projects

| Attribute | Type | Key |
|---|---|---|
| `projectId` | String | **PK** |
| `name` | String | |
| `description` | String | |
| `teamId` | String | **GSI PK** → `teamId-index` |
| `createdBy` | String | userId |
| `createdAt` | String | ISO 8601 |

**GSI — `teamId-index`:** Enables employees to query only projects belonging to their team.

### Tasks ⭐

The central table. Two GSIs are **required by the spec**.

| Attribute | Type | Key |
|---|---|---|
| `taskId` | String | **PK** |
| `projectId` | String | **SK** |
| `title` | String | |
| `description` | String | |
| `status` | String | `"To Do"` \| `"In Progress"` \| `"In Review"` \| `"Done"` |
| `priority` | String | `"Low"` \| `"Medium"` \| `"High"` |
| `deadline` | String | ISO date (`YYYY-MM-DD`) |
| `assigneeId` | String | **GSI PK** → `assigneeId-index` |
| `teamId` | String | **GSI PK** → `teamId-index` |
| `imageKey` | String | S3 key of original image (optional) |
| `thumbnailKey` | String | S3 key of resized thumbnail (optional) |
| `createdBy` | String | userId |
| `createdAt` | String | ISO 8601 |
| `updatedAt` | String | ISO 8601 |

**GSI — `teamId-index`:** Employee task queries. Every fetch by an employee goes through this index — server-side team isolation, not just UI hiding.

**GSI — `assigneeId-index`:** Per-user task queries. Used by the daily digest Lambda and for manager views filtered by assignee.

### Comments

| Attribute | Type | Key |
|---|---|---|
| `commentId` | String | **PK** |
| `taskId` | String | **SK** + **GSI PK** → `taskId-index` |
| `authorId` | String | userId |
| `body` | String | |
| `createdAt` | String | ISO 8601 |

**GSI — `taskId-index`:** Fetch all comments for a given task.

### StatusLogs

Immutable audit trail of every task status transition.

| Attribute | Type | Key |
|---|---|---|
| `logId` | String | **PK** (UUID) |
| `taskId` | String | |
| `fromStatus` | String | |
| `toStatus` | String | |
| `changedBy` | String | userId |
| `changedAt` | String | ISO 8601 |

Written by the backend API on every `PUT /api/tasks/:id` call that changes status.

### ActivityLogs

Written by the Assignment Worker Lambda when a task is assigned.

| Attribute | Type | Key |
|---|---|---|
| `logId` | String | **PK** (UUID) |
| `taskId` | String | |
| `type` | String | `"assignment"` |
| `payload` | Map | Full assignment event payload from SNS |
| `createdAt` | String | ISO 8601 |

### DynamoDB Summary

| Table | PK | SK | GSIs | Written by |
|---|---|---|---|---|
| Users | userId | — | — | Backend API |
| Teams | teamId | — | — | Backend API |
| Projects | projectId | — | teamId-index | Backend API |
| Tasks | taskId | projectId | teamId-index, assigneeId-index | Backend API |
| Comments | commentId | taskId | taskId-index | Backend API |
| StatusLogs | logId | — | — | Backend API |
| ActivityLogs | logId | — | — | Assignment Worker Lambda |

---

## 8. Object Storage — S3

### mini-jira-originals-{suffix}

| Property | Value |
|---|---|
| Purpose | Stores original task image attachments uploaded by users |
| Versioning | **Enabled** — old versions retained on replacement (spec requirement) |
| Public access | Blocked — images served via pre-signed GET URLs (15 min TTL) |
| CORS | Enabled — allows frontend to PUT directly via pre-signed URL |
| Upload flow | Backend generates pre-signed PUT URL → frontend uploads directly (never through backend) |

### mini-jira-resized-{suffix}

| Property | Value |
|---|---|
| Purpose | Stores 300×300 JPEG thumbnails produced by the ImageResize Lambda |
| Versioning | Disabled |
| Public access | Blocked |

### Image Upload Flow

```
Frontend
  │  1. POST /api/tasks/:id/image  →  Backend
  │                                     │  2. Generate pre-signed S3 PUT URL
  │  3. Returns { uploadUrl, key }  ←──┘
  │
  │  4. PUT <image bytes> → S3 originals (direct, no backend in path)
  │
S3 originals bucket
  │  5. s3:ObjectCreated:Put event
  ▼
ImageResize Lambda
  │  6. sharp.resize(300×300) → JPEG
  │  7. PUT thumbnail → S3 resized bucket
  └─ 8. UPDATE Tasks SET thumbnailKey = '...' (DynamoDB)

Frontend
  │  9. GET /api/tasks/:id/image-url?variant=thumbnail → Backend
  │                                                        │ 10. Generate pre-signed GET URL
  └─ 11. <img src={presignedUrl} />
```

---

## 9. Serverless — Lambda Functions

All three functions are TypeScript compiled to Node.js 20.x.

### ImageResizeLambda

| Property | Value |
|---|---|
| Runtime | Node.js 20.x |
| Handler | `index.handler` |
| Memory | 512 MB (sharp needs headroom) |
| Timeout | 30 s |
| Trigger | S3 PUT on originals bucket, prefix `tasks/`, suffix `.jpg/.jpeg/.png` |
| IAM Role | `Syncora-role-lambda-image-resize` |
| Env vars | `S3_RESIZED_BUCKET`, `DDB_TASKS_TABLE` |

**What it does:**
1. Receives S3 event record with the uploaded key
2. Downloads the original from S3
3. Resizes to max 300×300 px, converts to JPEG (quality 85)
4. Writes thumbnail to resized bucket at `tasks/<id>/thumbnails/<filename>`
5. Updates `thumbnailKey` on the DynamoDB Tasks record

### AssignmentWorkerLambda

| Property | Value |
|---|---|
| Runtime | Node.js 20.x |
| Handler | `index.handler` |
| Memory | 256 MB |
| Timeout | 30 s |
| Trigger | SQS `TaskAssignmentQueue` (wired in Phase 6) |
| IAM Role | `Syncora-role-lambda-assignment-worker` |
| Env vars | `DDB_ACTIVITY_LOGS_TABLE`, `CW_NAMESPACE` |

**What it does:**
1. Receives SQS records (each record = one task assignment event from SNS)
2. Parses the SNS-wrapped JSON envelope
3. Writes a row to `ActivityLogs` DynamoDB table
4. Emits `TasksAssigned` CloudWatch metric with `TeamId` dimension

### DailyDigestLambda

| Property | Value |
|---|---|
| Runtime | Node.js 20.x |
| Handler | `index.handler` |
| Memory | 256 MB |
| Timeout | 60 s |
| Trigger | EventBridge scheduled rule `cron(0 9 * * ? *)` — 9:00 AM UTC daily (wired in Phase 6) |
| IAM Role | `Syncora-role-lambda-daily-digest` |
| Env vars | `DDB_TASKS_TABLE`, `DDB_USERS_TABLE`, `SNS_DIGEST_TOPIC_ARN` |

**What it does:**
1. Scans Tasks table for items where `deadline` starts with today's date and `status ≠ Done`
2. Groups tasks by `assigneeId`
3. Looks up each assignee's name/email from the Users table
4. Publishes one SNS digest message per assignee listing their due tasks

---

## 10. Event-Driven Services — SNS + SQS + EventBridge

### SNS Topics

| Topic | ARN | Subscribers |
|---|---|---|
| `TaskAssignmentTopic` | `arn:aws:sns:us-east-1:586337032787:TaskAssignmentTopic` | Email (assignee), SQS (`TaskAssignmentQueue`) |
| `DailyDigestTopic` | `arn:aws:sns:us-east-1:586337032787:DailyDigestTopic` | Email (manager digest list) |

### SQS Queue

| Property | Value |
|---|---|
| Name | `TaskAssignmentQueue` |
| Type | Standard |
| Visibility timeout | 30 s |
| Subscriber | `AssignmentWorkerLambda` (event source mapping) |

### Assignment Event Flow

```
POST /api/tasks  (Backend)
  │
  ├─ 1. Write task to DynamoDB
  ├─ 2. sns.publish({ TopicArn: TaskAssignmentTopic, Message: JSON payload })
  │
  SNS TaskAssignmentTopic
  │
  ├──► Email subscription ──► assignee inbox ("New Task Assigned: ...")
  │
  └──► SQS TaskAssignmentQueue
            │
            ▼
       AssignmentWorkerLambda
            ├──► ActivityLogs row (DynamoDB)
            └──► MiniJira/TasksAssigned metric (CloudWatch)
```

### EventBridge Rule

| Property | Value |
|---|---|
| Name | `DailyDigestRule` |
| Schedule | `cron(0 9 * * ? *)` — every day at 09:00 UTC |
| Target | `DailyDigestLambda` |

---

## 11. Monitoring — CloudWatch

### Custom Metrics (Namespace: `MiniJira`)

| Metric | Dimensions | Source | Meaning |
|---|---|---|---|
| `TasksCreated` | `TeamId` | Backend API | Incremented on every `POST /api/tasks` |
| `TasksClosed` | `TeamId` | Backend API | Incremented when task moves to `Done` |
| `TasksAssigned` | `TeamId` | AssignmentWorkerLambda | Incremented per SQS message processed |
| `TimeToClose` | `TeamId` | Backend API | Seconds from `createdAt` to `Done` transition |
| `OverdueTasks` | — | Backend API (periodic) | Count of tasks past deadline and not Done |

### Dashboard — `MiniJiraDashboard`

| Widget | Metric | Period | Stat |
|---|---|---|---|
| Tasks Created Per Day | `MiniJira/TasksCreated` | 1 day | Sum |
| Tasks Closed Per Day Per Team | `MiniJira/TasksClosed` (dim: TeamId) | 1 day | Sum |
| Average Time To Close | `MiniJira/TimeToClose` | 1 day | Average |
| EC2 CPU Utilization | `AWS/EC2/CPUUtilization` (ASG) | 5 min | Average |

### Alarms

| Alarm | Metric | Threshold | Action |
|---|---|---|---|
| `OverdueTasksAlarm` | `MiniJira/OverdueTasks` | ≥ 10 in 1 hr | Publish to `TaskAssignmentTopic` (SNS email) |

---

## 12. IAM Roles

All roles follow least-privilege — only the exact actions and resources needed.

### Syncora-role-ec2-backend

Attached to EC2 instances via instance profile.

| Permission | Scope |
|---|---|
| `dynamodb:GetItem/PutItem/UpdateItem/DeleteItem/Query/Scan/Batch*` | 7 named tables + their indexes only |
| `s3:PutObject/GetObject/DeleteObject/ListBucket/GetObjectVersion` | `mini-jira-originals-*` and `mini-jira-resized-*` buckets only |
| `sns:Publish` | Any SNS topic in the account |
| `sqs:SendMessage/GetQueueUrl` | Any SQS queue in the account |
| `cloudwatch:PutMetricData` | `*` (required by CloudWatch API) |
| `AmazonCognitoReadOnly` | Managed policy — read user attributes |
| `CloudWatchAgentServerPolicy` | Managed policy — CloudWatch agent logs |

### Syncora-role-lambda-image-resize

| Permission | Scope |
|---|---|
| `s3:GetObject` | `mini-jira-originals-*/*` |
| `s3:PutObject` | `mini-jira-resized-*/*` |
| `AWSLambdaBasicExecutionRole` | CloudWatch Logs write |

### Syncora-role-lambda-assignment-worker

| Permission | Scope |
|---|---|
| `sqs:ReceiveMessage/DeleteMessage/GetQueueAttributes` | Any SQS queue in account |
| `dynamodb:PutItem/UpdateItem` | `ActivityLogs` and `Tasks` tables only |
| `cloudwatch:PutMetricData` | `*` |
| `AWSLambdaBasicExecutionRole` | CloudWatch Logs write |

### Syncora-role-lambda-daily-digest

| Permission | Scope |
|---|---|
| `dynamodb:Scan/Query` | `Tasks` table + indexes only |
| `sns:Publish` | Any SNS topic in account |
| `AWSLambdaBasicExecutionRole` | CloudWatch Logs write |

---

## 13. Request Flow — End to End

### Authenticated API Request

```
User browser
  │  HTTPS
  ▼
CloudFront
  │  HTTP (internal)
  ▼
Application Load Balancer
  │  Round-robin across healthy targets
  ▼
EC2 instance (private subnet, either AZ)
  │
  ├─ authMiddleware
  │    └─ CognitoJwtVerifier.verify(Bearer token)
  │         └─ Fetches JWKS from Cognito (cached after first call)
  │
  ├─ enforceTeamAccess
  │    └─ if employee: inject req.teamId
  │
  ├─ Route handler
  │    ├─ DynamoDB (via VPC Gateway Endpoint — stays in AWS network)
  │    ├─ S3       (via VPC Gateway Endpoint — stays in AWS network)
  │    └─ SNS      (via NAT Gateway → internet)
  │
  └─ JSON response → ALB → CloudFront → Browser
```

### Team Isolation — Critical Path

```
Employee Sara (teamId: "team-frontend") requests GET /api/tasks

enforceTeamAccess → sets req.teamId = "team-frontend"

Tasks route handler:
  QueryCommand({
    TableName: "Tasks",
    IndexName: "teamId-index",      ← GSI query, not scan
    KeyConditionExpression: "teamId = :tid",
    ExpressionAttributeValues: { ":tid": "team-frontend" }
  })

Result: only tasks with teamId="team-frontend"
Omar's Backend tasks are physically excluded at the DB query level.
Even if Sara guesses a Backend task ID and calls GET /api/tasks/:id,
the handler checks assertTeamMatches(req, task.teamId) → 403 Forbidden.
```

---

## 14. Demo Scenario Flow

The exact scenario required by the spec:

```
1. Ali (manager) logs in
   POST /api/tasks → creates Task A, assigns to sara, teamId=team-frontend
   └─ SNS publish → email to sara + SQS → AssignmentWorkerLambda logs activity

2. Ali creates Task B, assigns to omar, teamId=team-backend
   └─ SNS publish → email to omar + SQS → worker logs activity

3. Sara logs in
   GET /api/tasks → teamId-index GSI query for "team-frontend"
   └─ Returns Task A only. Task B is invisible — not 404, not hidden in UI.
      If Sara calls GET /api/tasks/<Task-B-id> → 403 Forbidden.

4. Omar logs in
   GET /api/tasks → teamId-index GSI query for "team-backend"
   └─ Returns Task B only.

5. Ali logs in as manager
   GET /api/tasks → full Scan (no team filter)
   └─ Returns both Task A and Task B.
   GET /api/tasks?teamId=team-frontend → manager filter by team
   └─ Returns Task A only.

6. Sara updates Task A: To Do → In Progress → In Review
   PUT /api/tasks/:id { status: "In Progress" }
   └─ StatusLogs row written (audit trail)

7. Ali moves Task A to Done
   PUT /api/tasks/:id { status: "Done" }
   └─ StatusLogs row written
   └─ CloudWatch metric: MiniJira/TasksClosed +1 (TeamId=team-frontend)
```

---

## 15. Cost & Free Tier Notes

| Service | Free Tier | Risk |
|---|---|---|
| EC2 t2.micro × 2 | 750 hrs/month combined | Stop instances when not working — 2 instances = 375 hrs each |
| ALB | 750 hrs/month | Only 1 ALB — within free tier |
| DynamoDB | 25 GB, PAY_PER_REQUEST | Well within limits for demo traffic |
| S3 | 5 GB, 20K GET, 2K PUT | Keep test uploads small |
| Lambda | 1M requests, 400K GB-seconds | Easily within free tier |
| CloudFront | 1 TB, 10M requests | Fine for demo |
| SNS | 1M publishes | Fine for demo |
| SQS | 1M requests | Fine for demo |
| Cognito | 50K MAU | Fine |
| **NAT Gateway** | **NOT free** | **~$32/month** — the only real cost. Delete when not in use. |
| VPC Gateway Endpoints | Free | S3 + DynamoDB traffic bypasses NAT entirely |

> **After submission:** Stop EC2 instances and ALB (don't terminate). Delete the NAT Gateway and release the Elastic IP to stop all ongoing charges.

---

## 16. Resource ID Reference

> These are live resource IDs in account `586337032787`, region `us-east-1`.

| Resource | ID |
|---|---|
| VPC | `vpc-0a4433d6a02ee46da` |
| Internet Gateway | `igw-05c255805c8a53c76` |
| Public Subnet A (us-east-1a) | `subnet-0ed61af225d0e8ffc` |
| Public Subnet B (us-east-1b) | `subnet-02cce912131fb6e90` |
| Private Subnet A (us-east-1a) | `subnet-021df78d783a303c9` |
| Private Subnet B (us-east-1b) | `subnet-028c4bb9b22b2e92e` |
| NAT Gateway A | `nat-0f77f565fc8df3a96` |
| Route Table — Public | `rtb-01ee42f7f978bd8f6` |
| Route Table — Private A | `rtb-05d75683d0a417a34` |
| Route Table — Private B | `rtb-0e531a94eccf25e96` |
| SG — ALB | `sg-029eea3f3fd2b9bd7` |
| SG — EC2 | `sg-0c94420f19b9755a0` |
| Cognito User Pool | `us-east-1_KZdyQQ1vY` |
| Cognito App Client | `6fa6pngmmdgasft7hio67r0lh0` |

---

*Generated: May 2026 | Mini-Jira on AWS | Software Cloud Computing Course*
