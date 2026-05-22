"use client";

import { useRouter } from "next/navigation";
import type { Task } from "@/types";

const PRIORITY_CONFIG = {
  Critical: { dot: "#8b3535", text: "#b05555" },
  High:     { dot: "#7a4a25", text: "#9e6840" },
  Medium:   { dot: "#7a6520", text: "#9e8438" },
  Low:      { dot: "#6b7280", text: "#9ca3af" },
} as const;

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
}

// ── Priority badge ────────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG];
  const dot = cfg?.dot ?? "#6b7280";
  const text = cfg?.text ?? "#9ca3af";
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
          style={{ background: dot + "18", color: text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
      {priority}
    </span>
  );
}

export default function TaskCard({
  task,
  projectName,
  assigneeName,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  projectName?: string;
  assigneeName?: string;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
}) {
  const router = useRouter();

  const overdue =
    !!task.deadline && normalizeStatus(task.status) !== "Done" && new Date(task.deadline) < new Date();

  const openTask = () => {
    if (isDragging) return;
    router.push(`/board?task=${task.taskId}`, { scroll: false });
  };

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.taskId)}
      onDragEnd={onDragEnd}
      style={{ opacity: isDragging ? 0.35 : 1, cursor: "grab" }}
    >
      <button
        type="button"
        onClick={openTask}
        className="block w-full text-left rounded-lg p-3.5 border border-outline-variant bg-surface hover:border-outline hover:shadow-lg transition-all group"
        style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}
      >
        {/* Title + drag dots */}
        <div className="flex items-start gap-2 mb-2.5">
          <p className="text-sm font-medium text-on-surface leading-snug flex-1 group-hover:text-primary transition-colors">{task.title}</p>
          <svg width="10" height="10" viewBox="0 0 10 16" fill="#444748" className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <circle cx="2.5" cy="2" r="1.5"/><circle cx="7.5" cy="2" r="1.5"/>
            <circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>
            <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
          </svg>
        </div>

        {task.description && (
          <p className="text-xs text-on-surface-variant leading-relaxed mb-2.5 line-clamp-2">{task.description}</p>
        )}

        {task.projectId && projectName && (
          <div className="mb-2.5">
            <span className="text-[11px] px-2 py-0.5 rounded bg-surface-container border border-outline-variant/60 text-on-surface-variant">
              {projectName}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <PriorityBadge priority={task.priority} />
          <div className="flex items-center gap-2">
            {task.deadline && (
              <span className="text-[11px]" style={{ color: overdue ? "#b05555" : "#8e9192" }}>
                {new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
            {task.assigneeId && assigneeName && (
              <div className="w-5 h-5 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface font-semibold"
                   style={{ fontSize: 9 }}
                   title={assigneeName}>
                {assigneeName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}
