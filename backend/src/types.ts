export type Role = "manager" | "employee" | "admin";

export type TaskStatus = "To Do" | "In Progress" | "In Review" | "Done";
export type TaskPriority = "Low" | "Medium" | "High";

export const TASK_STATUSES: TaskStatus[] = ["To Do", "In Progress", "In Review", "Done"];
export const TASK_PRIORITIES: TaskPriority[] = ["Low", "Medium", "High"];

export interface AuthUser {
  sub: string;
  email?: string;
  role: Role;
  teamId: string;
  orgId: string;
}

export interface Organization {
  orgId: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export interface Project {
  projectId: string;
  name: string;
  description: string;
  teamId: string;
  orgId: string;
  createdBy: string;
  createdAt: string;
}

export interface Task {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
  teamId: string;
  orgId: string;
  imageKey?: string;
  thumbnailKey?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  commentId: string;
  taskId: string;
  authorId: string;
  body: string;
  orgId: string;
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      teamId?: string;
    }
  }
}
