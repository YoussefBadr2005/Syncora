"use client";

import { useState } from "react";
import api from "@/lib/api";
import type { Task } from "@/types";
import TaskCard from "./TaskCard";

const STATUS_CONFIG = {
  "To Do":       { dot: "#6b7280", bg: "rgba(107,114,128,0.10)", text: "#8a8f96" },
  "In Progress": { dot: "#3d6b9e", bg: "rgba(61,107,158,0.12)",  text: "#5a8ab8" },
  "In Review":   { dot: "#8a6a1e", bg: "rgba(138,106,30,0.14)",  text: "#a88340" },
  "Done":        { dot: "#2d6e52", bg: "rgba(45,110,82,0.14)",   text: "#4a9070" },
} as const;

const KANBAN_COLS = ["To Do", "In Progress", "In Review", "Done"] as const;

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
}

export default function KanbanBoard({
  tasks,
  filtered,
  setTasks,
  projectMap,
  getUserName,
}: {
  tasks: Task[];
  filtered: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  projectMap: Record<string, string>;
  getUserName: (id: string) => string;
}) {
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // drag handlers — behavior ported verbatim from the original board
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("taskId", taskId);
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverCol(null); };
  const handleDrop = async (e: React.DragEvent, col: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;
    const task = tasks.find(t => t.taskId === taskId);
    if (!task || normalizeStatus(task.status) === col) { setDraggingId(null); setDragOverCol(null); return; }
    setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: col as Task["status"] } : t));
    setDraggingId(null); setDragOverCol(null);
    try { await api.put(`/tasks/${taskId}`, { status: col }); }
    catch { setTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: task.status } : t)); }
  };

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {KANBAN_COLS.map(col => {
        const cfg = STATUS_CONFIG[col];
        const colTasks = filtered.filter(t => normalizeStatus(t.status) === col);
        const isOver = dragOverCol === col;

        return (
          <div key={col}
            className="flex flex-col rounded-xl border transition-colors"
            style={{
              background: isOver ? "rgba(255,255,255,0.03)" : "#1c1b1b",
              borderColor: isOver ? "#8e9192" : "#444748",
              minHeight: 120,
            }}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
            onDragLeave={e => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDragOverCol(null);
            }}
            onDrop={e => handleDrop(e, col)}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-4 py-3.5 border-b border-outline-variant/60">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
              <span className="text-sm font-semibold text-on-surface flex-1">{col}</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: cfg.bg, color: cfg.text, minWidth: 22, textAlign: "center" }}>
                {colTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-col gap-2.5 p-3 overflow-y-auto flex-1"
                 style={{ maxHeight: "calc(100vh - 280px)" }}>
              {colTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 rounded-lg border-2 border-dashed transition-colors"
                     style={{ borderColor: isOver ? "#8e9192" : "transparent" }}>
                  {isOver
                    ? <p className="text-xs text-on-surface-variant">Drop here</p>
                    : <p className="text-xs text-on-surface-variant/40">No tasks</p>}
                </div>
              ) : colTasks.map(t => (
                <TaskCard
                  key={t.taskId}
                  task={t}
                  projectName={t.projectId ? projectMap[t.projectId] : undefined}
                  assigneeName={t.assigneeId ? getUserName(t.assigneeId) : undefined}
                  isDragging={draggingId === t.taskId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
