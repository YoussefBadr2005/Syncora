"use client";

import { useActivity, type ActivityLog } from "@/hooks/useActivity";
import Spinner from "./ui/Spinner";
import ErrorMessage from "./ui/ErrorMessage";

interface ActivityFeedProps {
  taskId?: string;
  limit?: number;
}

export default function ActivityFeed({ taskId, limit = 20 }: ActivityFeedProps) {
  const { activity, loading, error } = useActivity(taskId);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!activity || activity.length === 0) {
    return <p className="text-gray-500 text-sm">No activity yet</p>;
  }

  return (
    <div className="space-y-3">
      {activity.slice(0, limit).map((log: ActivityLog) => (
        <div
          key={log.logId}
          className="border-l-4 border-blue-400 bg-gray-50 p-3 rounded"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-800">
              {formatActivityType(log.type)}
            </span>
            <span className="text-xs text-gray-500">
              {formatTime(log.createdAt)}
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-1">
            {formatActivityMessage(log)}
          </p>
        </div>
      ))}
    </div>
  );
}

function formatActivityType(type: string): string {
  const map: Record<string, string> = {
    status_change: "Status Changed",
    task_assigned: "Task Assigned",
    comment_added: "Comment Added",
    task_created: "Task Created",
  };
  return map[type] || type;
}

function formatActivityMessage(log: ActivityLog): string {
  const p = log.payload as Record<string, any>;
  switch (log.type) {
    case "status_change":
      return `Status changed from "${p.fromStatus}" to "${p.toStatus}"`;
    case "task_assigned":
      return `Assigned to user ${p.assigneeId}`;
    case "comment_added":
      return `Comment: "${p.body?.substring(0, 50)}${(p.body?.length ?? 0) > 50 ? "..." : ""}"`;
    case "task_created":
      return `Task created: "${p.title}"`;
    default:
      return JSON.stringify(p).substring(0, 100);
  }
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
