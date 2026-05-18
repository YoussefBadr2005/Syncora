"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useActivity } from "@/hooks/useActivity";
import type { ActivityLog } from "@/types";

function formatType(type: string): string {
  const map: Record<string, string> = {
    STATUS_CHANGED: "Status changed",
    TASK_ASSIGNED: "Task assigned",
    TASK_CREATED: "Task created",
    COMMENT_ADDED: "Comment",
  };
  return map[type] ?? type;
}

function formatMessage(log: ActivityLog): string {
  const p = log.payload as Record<string, unknown>;
  switch (log.type) {
    case "STATUS_CHANGED":
      return `${p.fromStatus} → ${p.toStatus}`;
    case "TASK_ASSIGNED":
      return String(p.taskTitle ?? "New assignment");
    case "TASK_CREATED":
      return String(p.title ?? "New task");
    default:
      return "";
  }
}

export default function NotificationBell() {
  const { activity, loading } = useActivity();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const recent = activity.slice(0, 8);
  const hasUnread = recent.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-all"
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {hasUnread && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 bg-surface-container-low border border-outline-variant rounded-lg overflow-hidden z-50"
          style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
        >
          <div className="px-4 py-3 border-b border-outline-variant">
            <p className="text-sm font-semibold text-on-surface">Notifications</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <p className="px-4 py-6 text-xs text-on-surface-variant text-center">Loading…</p>
            )}
            {!loading && recent.length === 0 && (
              <p className="px-4 py-6 text-xs text-on-surface-variant text-center">No recent activity</p>
            )}
            {recent.map((log) => (
              <Link
                key={log.logId}
                href={`/tasks/${log.taskId}`}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 hover:bg-surface-container-high border-b border-outline-variant/50 last:border-0 transition-colors"
              >
                <p className="text-xs font-semibold text-on-surface">{formatType(log.type)}</p>
                <p className="text-xs text-on-surface-variant mt-0.5 truncate">{formatMessage(log)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
