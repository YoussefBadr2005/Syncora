"use client";

import { useActivity } from "@/hooks/useActivity";
import type { ActivityLog } from "@/types";
import Spinner from "./ui/Spinner";
import ErrorMessage from "./ui/ErrorMessage";

interface ActivityFeedProps {
  taskId?: string;
  limit?: number;
  refreshKey?: number;
}

const TYPE_DOT: Record<string, string> = {
  TASK_CREATED: "#8e9192",
  STATUS_CHANGED: "#c6c6c7",
  TASK_ASSIGNED: "#ffffff",
  COMMENT_ADDED: "#8e9192",
  IMAGE_ATTACHED: "#7aa3d6",
  IMAGE_REPLACED: "#7aa3d6",
  IMAGE_REMOVED: "#b05555",
};

export default function ActivityFeed({ taskId, limit = 20, refreshKey = 0 }: ActivityFeedProps) {
  const { activity, loading, error } = useActivity(taskId, refreshKey);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!activity || activity.length === 0) {
    return <p className="text-sm text-on-surface-variant">No activity yet</p>;
  }

  const items = activity.slice(0, limit);

  return (
    <div className="space-y-0">
      {items.map((log: ActivityLog, i) => {
        const isLast = i === items.length - 1;
        return (
          <div key={log.logId ?? i} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0" style={{ width: 16 }}>
              <span
                className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                style={{ background: TYPE_DOT[log.type] ?? "#8e9192" }}
              />
              {!isLast && (
                <div className="w-px flex-1 mt-1 mb-1" style={{ background: "#444748" }} />
              )}
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <p className="text-xs font-semibold text-on-surface leading-snug">
                {formatActivityType(log.type)}
              </p>
              <p className="text-xs text-on-surface-variant leading-snug mt-0.5">
                {formatActivityMessage(log)}
              </p>
              <p className="text-[10px] text-on-surface-variant/60 mt-0.5">
                {formatTime(log.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatActivityType(type: string): string {
  const map: Record<string, string> = {
    STATUS_CHANGED: "Status Changed",
    TASK_ASSIGNED: "Task Assigned",
    COMMENT_ADDED: "Comment Added",
    TASK_CREATED: "Task Created",
    IMAGE_ATTACHED: "Image Attached",
    IMAGE_REPLACED: "Image Replaced",
    IMAGE_REMOVED: "Image Removed",
  };
  return map[type] ?? type;
}

function formatActivityMessage(log: ActivityLog): string {
  const p = log.payload as Record<string, unknown>;
  switch (log.type) {
    case "STATUS_CHANGED":
      return `Moved from "${p.fromStatus}" to "${p.toStatus}"`;
    case "TASK_ASSIGNED":
      return `Assigned to ${p.assigneeId}`;
    case "COMMENT_ADDED":
      return `Comment: "${p.preview ?? ""}"`;
    case "TASK_CREATED":
      return `Task created: "${p.title}"`;
    case "IMAGE_ATTACHED":
      return p.filename ? `Attached "${p.filename}"` : "Attached an image";
    case "IMAGE_REPLACED":
      return p.filename ? `Replaced attachment with "${p.filename}"` : "Replaced the attachment";
    case "IMAGE_REMOVED":
      return "Removed the attachment";
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
