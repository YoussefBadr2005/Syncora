// ─── Enums ────────────────────────────────────────────────────────────────────
export type TaskStatus   = "Todo" | "InProgress" | "InReview" | "Done";
export type TaskPriority = "Low" | "Medium" | "High" | "Critical";
export type Role         = "manager" | "employee" | "admin";

// ─── Core entities ────────────────────────────────────────────────────────────
export interface User {
  userId: string;
  email: string;
  name?: string;
  role: Role;
  teamId: string;
}

export interface Team {
  teamId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Project {
  projectId: string;
  name: string;
  description?: string;
  teamId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  taskId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  teamId: string;
  assigneeId?: string;
  deadline?: string;
  imageKey?: string;
  thumbnailKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  commentId: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface ActivityLog {
  logId: string;
  taskId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────
export interface ApiError {
  error: string;
  message?: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
}
