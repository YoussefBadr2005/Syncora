# Syncora — Mini-Jira on AWS

Syncora is a lightweight, team-scoped task management application (inspired by Jira/Trello) hosted entirely on a high-availability infrastructure in AWS. The system supports multiple teams (Frontend, Backend, etc.), role-based access control (Managers, Employees), event-driven notifications (SNS + SQS + Lambdas), automated image processing, and full CloudWatch dashboard monitoring.

For the complete technical blueprint, please see:
*   📚 **[VPC, DB, & Services Architecture Reference](file:///d:/Syncora/ARCHITECTURE.md)**
*   📋 **[AWS Deployment & Step-by-Step Implementation Plan](file:///d:/Syncora/mini-jira-aws-implementation-plan.md)**

---

## 🚀 How to Run Locally

Since the cloud backend services are already deployed in AWS by your team member, you can run the application servers locally on your machine and connect them directly to the live AWS services (Cognito, DynamoDB, S3, SNS).

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   Node.js (version 20 LTS recommended)
*   AWS CLI v2 (configured with programmatic IAM access keys to authorize local queries)

---

### 2. Configure Environment Files

You should have been provided two files containing the actual live resource IDs. Place them in their respective directories:

1.  **Backend Environment File**:
    *   **Filename**: `.env`
    *   **Destination**: `backend/.env`
    *   *Reference format:* See `backend/.env.example`.
2.  **Frontend Environment File**:
    *   **Filename**: `.env.local`
    *   **Destination**: `frontend/my-app/.env.local`
    *   *Reference format:*
        ```env
        NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_KZdyQQ1vY
        NEXT_PUBLIC_COGNITO_CLIENT_ID=6fa6pngmmdgasft7hio67r0lh0
        NEXT_PUBLIC_API_URL=http://localhost:3000/api
        ```

---

### 3. Spin Up the Backend Server
Open a terminal in the root of the project:

```bash
cd backend
npm install
npm run dev
```
*   The API server will run at `http://localhost:3000`
*   Health check: `GET http://localhost:3000/api/health`

---

### 4. Spin Up the Frontend Server
Open a second terminal in the root of the project:

```bash
cd frontend/my-app
npm install
npm run dev
```
*   Open **[http://localhost:3000](http://localhost:3000)** in your browser.
*   Log in using the pre-seeded demo credentials.

---

## 🔑 Pre-Seeded Demo Users

These accounts are already created in your Cognito User Pool and seeded in the database:

| Email | Password | Role | Access / Visibility |
|---|---|---|---|
| **ali@demo.com** | `Manager123!` | Manager | Can create projects/tasks, assign to anyone, view all teams |
| **sara@demo.com** | `Employee123!` | Employee | Frontend team (`team-frontend`) isolation (sees own tasks only) |
| **omar@demo.com** | `Employee123!` | Employee | Backend team (`team-backend`) isolation (sees own tasks only) |

---

## ⚡ Cloud Operations (Saving Money)

NAT Gateways cost **~$32/month** each and are not covered by the AWS Free Tier. To avoid charges when not actively working or demoing, use the provided helper scripts:

*   **Turn Off Outbound NAT Gateway (Saves Money)**:
    ```bash
    ./bashCommands/nat-stop.sh
    ```
*   **Restore Outbound NAT Gateway (Required before running the app/APIs)**:
    ```bash
    ./bashCommands/nat-start.sh
    ```

---

## 🖼️ Re-Deploying the Image-Resize Lambda
If you ever need to rebuild and upload the image resize Lambda function using the Linux-compatible `sharp` binary:

1. Open PowerShell
2. Run:
   ```powershell
   cd lambdas/image-resize
   .\deploy.ps1
   ```
This script will compile TypeScript, install the Linux target package, zip the deployment package, and upload it directly to AWS.
