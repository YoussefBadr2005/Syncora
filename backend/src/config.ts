import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  region: process.env.AWS_REGION || "us-east-1",

  cognito: {
    userPoolId: required("COGNITO_USER_POOL_ID"),
    clientId: required("COGNITO_CLIENT_ID"),
  },

  tables: {
    organizations: process.env.DDB_ORGS_TABLE || "Organizations",
    users: process.env.DDB_USERS_TABLE || "Users",
    teams: process.env.DDB_TEAMS_TABLE || "Teams",
    projects: process.env.DDB_PROJECTS_TABLE || "Projects",
    tasks: process.env.DDB_TASKS_TABLE || "Tasks",
    comments: process.env.DDB_COMMENTS_TABLE || "Comments",
    statusLogs: process.env.DDB_STATUS_LOGS_TABLE || "StatusLogs",
    activityLogs: process.env.DDB_ACTIVITY_LOGS_TABLE || "ActivityLogs",
  },

  indexes: {
    tasksTeam: process.env.DDB_TASKS_TEAM_INDEX || "teamId-index",
    tasksAssignee: process.env.DDB_TASKS_ASSIGNEE_INDEX || "assigneeId-index",
    projectsTeam: process.env.DDB_PROJECTS_TEAM_INDEX || "teamId-index",
    commentsTask: process.env.DDB_COMMENTS_TASK_INDEX || "taskId-index",
    usersOrg: process.env.DDB_USERS_ORG_INDEX || "orgId-index",
    teamsOrg: process.env.DDB_TEAMS_ORG_INDEX || "orgId-index",
    activityTask: process.env.DDB_ACTIVITY_TASK_INDEX || "taskId-index",
    activityOrg: process.env.DDB_ACTIVITY_ORG_INDEX || "orgId-index",
  },

  s3: {
    originalsBucket: process.env.S3_ORIGINALS_BUCKET || "",
    resizedBucket: process.env.S3_RESIZED_BUCKET || "",
  },

  sns: {
    taskAssignmentTopicArn: process.env.SNS_TASK_ASSIGNMENT_TOPIC || "",
  },

  cloudwatch: {
    namespace: process.env.CW_NAMESPACE || "MiniJira",
  },
};
