"use client";

import { useDigest } from "@/hooks/useDigest";
import { useUsers } from "@/hooks/useUsers";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import ErrorMessage from "@/components/ui/ErrorMessage";
import type { Task } from "@/types";

const PRIORITY_CONFIG: Record<string, { dot: string; text: string }> = {
  Critical: { dot: "#8b3535", text: "#b05555" },
  High:     { dot: "#7a4a25", text: "#9e6840" },
  Medium:   { dot: "#7a6520", text: "#9e8438" },
  Low:      { dot: "#6b7280", text: "#9ca3af" },
};

function normalizeStatus(s: string) {
  if (s === "Todo") return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview") return "In Review";
  return s;
}

export default function DigestPage() {
  const { digest, loading, error } = useDigest();
  const { users } = useUsers();

  const userMap = Object.fromEntries(users.map(u => [u.userId, u]));

  function displayName(id: string) {
    if (id === "unassigned") return "Unassigned";
    const u = userMap[id];
    if (!u) return id.slice(0, 8) + "…";
    return u.name ?? u.email?.split("@")[0] ?? id.slice(0, 8) + "…";
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
        </div>
      </ProtectedLayout>
    );
  }

  if (error) {
    return (
      <ProtectedLayout>
        <ErrorMessage message={error} />
      </ProtectedLayout>
    );
  }

  const taskCount = digest?.total ?? 0;
  const dateLabel = new Date(digest?.date ?? "").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <ProtectedLayout>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Daily Digest</h1>
        <p className="text-sm text-on-surface-variant mt-1">Tasks due on {dateLabel}</p>
        <p className="text-xs text-on-surface-variant/80 mt-2">
          Assignees also receive an email digest each day at 9:00 AM (EventBridge + SNS).
        </p>
      </div>

      {/* Summary card */}
      <div className="bg-surface-container rounded-xl border border-outline-variant p-6 mb-6">
        <div className="flex items-center gap-5">
          <span className="text-5xl font-bold text-on-surface tabular-nums leading-none">
            {taskCount}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Due Today
            </p>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {taskCount === 1 ? "task" : "tasks"} assigned across the team
            </p>
          </div>
        </div>
      </div>

      {/* Tasks grouped by assignee */}
      {taskCount === 0 ? (
        <div className="bg-surface-container rounded-xl border border-outline-variant py-16 text-center">
          <p className="text-on-surface text-base">No tasks due today</p>
          <p className="text-on-surface-variant text-sm mt-1">
            You&apos;re all caught up.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(digest?.byAssignee ?? {}).map(([assigneeId, tasks]) => (
            <div
              key={assigneeId}
              className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-outline-variant flex items-center justify-between">
                <h2 className="text-sm font-semibold text-on-surface">
                  {displayName(assigneeId)}
                </h2>
                <span className="text-xs text-on-surface-variant">
                  {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>
              <div className="divide-y divide-outline-variant">
                {(tasks as Task[]).map((task) => {
                  const pcfg = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.Low;
                  return (
                    <a
                      key={task.taskId}
                      href={`/tasks/${task.taskId}`}
                      className="block px-5 py-3 hover:bg-surface-container-high transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-on-surface truncate">
                            {task.title}
                          </h3>
                          {task.description && (
                            <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ background: pcfg.dot }}
                              />
                              <span style={{ color: pcfg.text }}>{task.priority}</span>
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant">
                              {normalizeStatus(task.status)}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-on-surface-variant flex-shrink-0 mt-0.5">
                          View
                          <span aria-hidden> &rsaquo;</span>
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </ProtectedLayout>
  );
}
