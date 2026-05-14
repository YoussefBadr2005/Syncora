"use client";

import { useEffect, useState } from "react";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Task, Team, User, Project } from "@/types";
import Link from "next/link";

// ─── Palette (4 colors only) ──────────────────────────────────────────────────
const C = {
  primary:   "#232F3E",
  accent:    "#FF9900",
  blue:      "#0073BB",
  neutral:   "#64748B",
};

// ─── Status / priority mapped to palette ─────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  "To Do":       C.neutral,
  "In Progress": C.blue,
  "In Review":   C.accent,
  "Done":        C.primary,
};

const PRIORITY_COLOR: Record<string, string> = {
  Critical: C.primary,
  High:     C.accent,
  Medium:   C.blue,
  Low:      C.neutral,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
}

function isOverdue(task: Task) {
  return task.deadline && normalizeStatus(task.status) !== "Done" && new Date(task.deadline) < new Date();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function deadlineDays(deadline: string) {
  const d = new Date(deadline);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

// ─── Shared micro-components ──────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold" style={{ color: C.primary }}>{children}</h2>
      {action}
    </div>
  );
}

function ViewLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs font-medium hover:underline" style={{ color: C.blue }}>
      View all
    </Link>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLOR[priority] ?? C.neutral;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
          style={{ background: color + "18", color }}>
      {priority}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return <span className="w-2 h-2 rounded-full flex-shrink-0 inline-block" style={{ background: STATUS_COLOR[status] ?? C.neutral }} />;
}

function ProgressBar({ pct, color = C.accent }: { pct: number; color?: string }) {
  return (
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#F1F5F9" }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ─── Manager Dashboard ────────────────────────────────────────────────────────
function ManagerDashboard({ tasks, teams, users, projects, activity }: {
  tasks: Task[]; teams: Team[]; users: User[];
  projects: Project[]; activity: Record<string, unknown>[];
}) {
  const today     = new Date().toISOString().split("T")[0];
  const active    = tasks.filter(t => t.status !== "Done");
  const overdue   = tasks.filter(t => isOverdue(t));
  const doneToday = tasks.filter(t => t.status === "Done" && t.updatedAt?.startsWith(today));
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  const avgClose = (() => {
    const closed = tasks.filter(t => t.status === "Done" && t.createdAt && t.updatedAt);
    if (!closed.length) return "—";
    const avg = closed.reduce((s, t) =>
      s + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()), 0) / closed.length;
    return (avg / 86400000).toFixed(1) + "d";
  })();

  const teamRows = teams.map(team => {
    const tt   = tasks.filter(t => t.teamId === team.teamId);
    const done = tt.filter(t => t.status === "Done").length;
    const ov   = tt.filter(t => isOverdue(t)).length;
    const pct  = tt.length ? Math.round((done / tt.length) * 100) : 0;
    return { team, total: tt.length, done, overdue: ov, pct };
  });

  const userName = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u?.name || u?.email?.split("@")[0] || id.slice(0, 8);
  };

  const kanbanCols = [
    { label: "To Do",       color: C.neutral, tasks: tasks.filter(t => t.status === "To Do") },
    { label: "In Progress", color: C.blue,    tasks: tasks.filter(t => t.status === "In Progress") },
    { label: "In Review",   color: C.accent,  tasks: tasks.filter(t => t.status === "In Review") },
    { label: "Done",        color: C.primary, tasks: tasks.filter(t => t.status === "Done") },
  ];

  const statCards = [
    {
      label: "Active Tasks", value: active.length, color: C.blue,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/><polyline points="9 12 11 14 15 10"/></svg>,
    },
    {
      label: "Overdue", value: overdue.length, color: overdue.length > 0 ? C.accent : C.neutral,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    },
    {
      label: "Done Today", value: doneToday.length, color: C.primary,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    },
    {
      label: "Avg Close", value: avgClose, color: C.neutral,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    },
    {
      label: "Projects", value: projects.length, color: C.blue,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
    },
  ];

  return (
    <>
      {/* Greeting + date */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.primary }}>{greeting} 👋</h1>
          <p className="text-sm mt-0.5" style={{ color: C.neutral }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        {overdue.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold"
               style={{ background: C.accent + "15", color: C.accent, border: `1px solid ${C.accent}30` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {overdue.length} overdue task{overdue.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Stat cards — icon style */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-5">
        {statCards.map(({ label, value, color, icon }) => (
          <Card key={label} className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: color + "15", color }}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight" style={{ color }}>{value}</p>
              <p className="text-xs font-medium mt-0.5 truncate" style={{ color: C.neutral }}>{label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.accent}30` }}>
          <div className="flex items-center gap-3 px-5 py-3"
               style={{ background: C.accent + "12" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="text-sm font-semibold" style={{ color: C.accent }}>
              {overdue.length} Overdue Task{overdue.length !== 1 ? "s" : ""}
            </span>
            <Link href="/tasks?status=overdue" className="ml-auto text-xs font-semibold hover:underline" style={{ color: C.accent }}>
              View all →
            </Link>
          </div>
          <div className="bg-white divide-y" style={{ divideColor: "#F8FAFC" }}>
            {overdue.slice(0, 3).map(t => (
              <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: C.accent }} />
                <span className="text-sm font-medium flex-1 truncate" style={{ color: C.primary }}>{t.title}</span>
                {t.assigneeId && (
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                         style={{ background: C.blue, fontSize: 9 }}>
                      {userName(t.assigneeId).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs hidden sm:block" style={{ color: C.neutral }}>{userName(t.assigneeId)}</span>
                  </span>
                )}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg flex-shrink-0"
                      style={{ background: C.accent + "15", color: C.accent }}>
                  {t.deadline ? new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date"}
                </span>
              </Link>
            ))}
            {overdue.length > 3 && (
              <div className="px-5 py-2.5 bg-white">
                <span className="text-xs" style={{ color: C.neutral }}>+{overdue.length - 3} more overdue tasks</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Kanban + Team Performance */}
      <div className="grid grid-cols-5 gap-5 mb-5">

        {/* Kanban */}
        <Card className="col-span-3 p-5">
          <SectionTitle action={
            <Link href="/tasks" className="flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: C.blue }}>
              View Board
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          }>
            Kanban Overview
          </SectionTitle>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {kanbanCols.map(col => (
              <div key={col.label} className="flex-1 min-w-[148px] rounded-xl flex flex-col"
                   style={{ background: "#F8FAFC", border: "1px solid #E8ECF0" }}>
                {/* Column header */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "#E8ECF0" }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-xs font-semibold flex-1" style={{ color: C.primary }}>{col.label}</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                        style={{ background: col.color + "20", color: col.color }}>
                    {col.tasks.length}
                  </span>
                </div>
                {/* Cards */}
                <div className="flex flex-col gap-2 p-2 overflow-y-auto" style={{ maxHeight: 300 }}>
                  {col.tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-1">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "44"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
                      </svg>
                      <p className="text-xs italic" style={{ color: C.neutral + "55" }}>Empty</p>
                    </div>
                  ) : col.tasks.slice(0, 5).map(t => (
                    <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                      className="block rounded-xl p-2.5 bg-white transition-all hover:shadow-md hover:-translate-y-px"
                      style={{ border: "1px solid #EEF0F3" }}>
                      <p className="text-xs font-semibold leading-snug mb-2.5" style={{ color: C.primary }}>{t.title}</p>
                      <div className="flex items-center justify-between gap-1">
                        <PriorityBadge priority={t.priority} />
                        {t.assigneeId && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0"
                               style={{ background: C.primary, fontSize: 9, fontWeight: 700 }}>
                            {userName(t.assigneeId).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                  {col.tasks.length > 5 && (
                    <Link href="/tasks" className="text-xs text-center py-1.5 font-semibold rounded-lg hover:bg-gray-100 transition-colors" style={{ color: C.blue }}>
                      +{col.tasks.length - 5} more
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Team Performance */}
        <Card className="col-span-2 p-5">
          <SectionTitle>Team Performance</SectionTitle>
          {teamRows.length === 0 ? (
            <p className="text-sm" style={{ color: C.neutral }}>No teams found.</p>
          ) : (
            <div className="space-y-4">
              {teamRows.map(r => (
                <div key={r.team.teamId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold" style={{ color: C.primary }}>{r.team.name}</span>
                    <span className="text-xs font-bold" style={{ color: C.blue }}>{r.pct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden mb-1.5" style={{ background: "#F1F5F9" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                         style={{ width: `${r.pct}%`, background: C.blue }} />
                  </div>
                  <div className="flex items-center gap-4 text-xs" style={{ color: C.neutral }}>
                    <span>{r.total} total</span>
                    <span className="font-semibold" style={{ color: C.blue }}>{r.done} done</span>
                    {r.overdue > 0 && (
                      <span className="font-semibold" style={{ color: C.accent }}>{r.overdue} overdue</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom row: Projects + Activity + Priority */}
      <div className="grid grid-cols-5 gap-5">

        {/* Projects */}
        <Card className="col-span-2 p-5">
          <SectionTitle action={<ViewLink href="/projects" />}>Projects</SectionTitle>
          {projects.length === 0 ? (
            <p className="text-sm" style={{ color: C.neutral }}>No projects yet.</p>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((p, i) => {
                const pt  = tasks.filter(t => t.projectId === p.projectId);
                const pct = pt.length ? Math.round((pt.filter(t => t.status === "Done").length / pt.length) * 100) : 0;
                const colors = [C.blue, C.accent, C.primary, C.neutral, C.blue];
                const col = colors[i % colors.length];
                return (
                  <Link key={p.projectId} href={`/projects`}
                    className="flex items-center gap-3 group">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                         style={{ background: col }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold truncate" style={{ color: C.primary }}>{p.name}</p>
                        <span className="text-xs ml-2 flex-shrink-0 font-semibold" style={{ color: C.neutral }}>{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#F1F5F9" }}>
                        <div className="h-full rounded-full transition-all duration-700"
                             style={{ width: `${pct}%`, background: col }} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: C.neutral }}>{pt.length} task{pt.length !== 1 ? "s" : ""}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="col-span-2 p-5">
          <SectionTitle>Recent Activity</SectionTitle>
          {activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "44"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-sm" style={{ color: C.neutral }}>No recent activity.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activity.slice(0, 6).map((a, i) => {
                const log       = a as { logId?: string; taskId?: string; fromStatus?: string; toStatus?: string; changedBy?: string; changedAt?: string; createdAt?: string };
                const who       = userName(log.changedBy ?? "");
                const taskTitle = tasks.find(t => t.taskId === log.taskId)?.title ?? log.taskId?.slice(0, 12) ?? "a task";
                const toStatus  = log.toStatus ?? "";
                const timestamp = log.changedAt ?? log.createdAt ?? "";
                return (
                  <div key={log.logId ?? i} className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                         style={{ background: C.primary }}>
                      {who.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed" style={{ color: C.neutral }}>
                        <span className="font-semibold" style={{ color: C.primary }}>{who}</span>
                        {" moved "}
                        <Link href={`/tasks/${log.taskId}`} className="font-semibold hover:underline truncate" style={{ color: C.primary }}>
                          {taskTitle}
                        </Link>
                        {" to "}
                        <span className="font-semibold" style={{ color: STATUS_COLOR[toStatus] ?? C.neutral }}>{toStatus}</span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: C.neutral + "88" }}>{timestamp ? timeAgo(timestamp) : ""}</p>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                         style={{ background: STATUS_COLOR[toStatus] ?? C.neutral }} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Priority breakdown */}
        <Card className="col-span-1 p-5">
          <SectionTitle>By Priority</SectionTitle>
          <div className="space-y-4">
            {(["Critical", "High", "Medium", "Low"] as const).map(p => {
              const count = tasks.filter(t => t.priority === p && t.status !== "Done").length;
              const pct   = tasks.length ? Math.round((count / tasks.length) * 100) : 0;
              const color = PRIORITY_COLOR[p];
              return (
                <div key={p}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: C.neutral }}>{p}</span>
                    <span className="text-xs font-bold" style={{ color }}>{count}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "#F1F5F9" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                         style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}

// ─── Employee Dashboard ───────────────────────────────────────────────────────
function EmployeeDashboard({ tasks, projects, activity, userId, userName: displayName }: {
  tasks: Task[]; projects: Project[];
  activity: Record<string, unknown>[]; userId: string; userName: string;
}) {
  const myTasks   = tasks.filter(t => t.assigneeId === userId);
  const myActive  = myTasks.filter(t => t.status !== "Done");
  const myOverdue = myTasks.filter(t => isOverdue(t));
  const today     = new Date().toISOString().split("T")[0];
  const dueToday  = myActive.filter(t => t.deadline?.startsWith(today));
  const inReview  = myTasks.filter(t => t.status === "In Review");
  const completed = myTasks.filter(t => t.status === "Done");

  const dueSoon = myActive
    .filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 8);

  // All team tasks (matches Tasks page), with "mine" highlighted
  const kanbanCols = [
    { label: "To Do",       color: C.neutral, tasks: tasks.filter(t => t.status === "To Do") },
    { label: "In Progress", color: C.blue,    tasks: tasks.filter(t => t.status === "In Progress") },
    { label: "In Review",   color: C.accent,  tasks: tasks.filter(t => t.status === "In Review") },
    { label: "Done",        color: C.primary, tasks: tasks.filter(t => t.status === "Done") },
  ];

  const projectMap = Object.fromEntries(projects.map(p => [p.projectId, p.name]));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <>
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: C.primary }}>{greeting}, {displayName}</h1>
        <p className="text-sm mt-0.5" style={{ color: C.neutral }}>
          {dueToday.length > 0
            ? `You have ${dueToday.length} task${dueToday.length !== 1 ? "s" : ""} due today.`
            : myOverdue.length > 0
              ? `You have ${myOverdue.length} overdue task${myOverdue.length !== 1 ? "s" : ""}.`
              : "You're all caught up!"}
        </p>
      </div>

      {/* Stat cards — icon + number layout, 4-color icons only */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">

        {/* Assigned */}
        <Card className="p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: C.blue + "18" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: C.primary }}>{myTasks.length}</p>
            <p className="text-xs font-medium" style={{ color: C.neutral }}>Assigned Tasks</p>
          </div>
        </Card>

        {/* Due Today */}
        <Card className="p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: C.accent + "18" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: dueToday.length > 0 ? C.accent : C.primary }}>{dueToday.length}</p>
            <p className="text-xs font-medium" style={{ color: C.neutral }}>Due Today</p>
          </div>
        </Card>

        {/* Completed */}
        <Card className="p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: C.primary + "12" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: C.primary }}>{completed.length}</p>
            <p className="text-xs font-medium" style={{ color: C.neutral }}>Completed</p>
          </div>
        </Card>

        {/* In Review */}
        <Card className="p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: C.accent + "18" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: C.accent }}>{inReview.length}</p>
            <p className="text-xs font-medium" style={{ color: C.neutral }}>In Review</p>
          </div>
        </Card>
      </div>

      {/* Team Kanban (read-only preview) */}
      <Card className="p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: C.primary }}>Team Kanban</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.neutral }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.accent + "22", border: `1px solid ${C.accent}55` }} />
                = My Tasks
              </span>
            </div>
          </div>
          <Link href="/tasks" className="text-xs font-semibold hover:underline" style={{ color: C.blue }}>
            Open Board →
          </Link>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {kanbanCols.map(col => (
            <div key={col.label} className="flex flex-col rounded-2xl"
                 style={{ background: "#F8FAFC", border: "1px solid #E4E9EF" }}>

              {/* Column header — matches Tasks page */}
              <div className="flex items-center gap-2.5 px-4 py-3.5 border-b" style={{ borderColor: "#E4E9EF" }}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                <span className="text-sm font-bold flex-1" style={{ color: C.primary }}>{col.label}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: col.color + "20", color: col.color, minWidth: 26, textAlign: "center" }}>
                  {col.tasks.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ minHeight: 200, maxHeight: 420 }}>
                {col.tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "40"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>
                    </svg>
                    <p className="text-xs" style={{ color: C.neutral + "66" }}>No tasks</p>
                  </div>
                ) : col.tasks.map(t => {
                  const mine = t.assigneeId === userId;
                  return (
                    <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                      className="block rounded-xl p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
                      style={{
                        background: mine ? C.accent + "0E" : "white",
                        border: mine ? `1px solid ${C.accent}55` : "1px solid #E8EDF2",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      }}>
                      <p className="text-sm font-semibold leading-snug mb-3" style={{ color: C.primary }}>{t.title}</p>

                      {t.description && (
                        <p className="text-xs leading-relaxed mb-3 line-clamp-2" style={{ color: C.neutral }}>
                          {t.description}
                        </p>
                      )}

                      {t.projectId && projectMap[t.projectId] && (
                        <div className="mb-3">
                          <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                                style={{ background: C.blue + "12", color: C.blue }}>
                            {projectMap[t.projectId]}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <PriorityBadge priority={t.priority} />
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {t.deadline && (
                            <span className="text-xs font-medium" style={{ color: C.neutral }}>
                              {new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {t.assigneeId && (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white"
                                 style={{ background: mine ? C.accent : C.primary, fontSize: 10 }}>
                              {t.assigneeId.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Due Soon row */}
      <div className="mb-5">

        {/* Due Soon */}
        <Card className="p-5">
          <SectionTitle action={<ViewLink href="/tasks" />}>Due Soon</SectionTitle>
          {dueSoon.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm" style={{ color: C.neutral }}>No upcoming deadlines.</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Task", "Deadline", "Priority"].map(h => (
                    <th key={h} className="pb-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.neutral }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dueSoon.map(t => {
                  const days = deadlineDays(t.deadline!);
                  const dlColor = days <= 0 ? C.accent : days <= 1 ? C.accent : days <= 3 ? C.blue : C.neutral;
                  const dlText  = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`;
                  return (
                    <tr key={t.taskId} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 pr-2">
                        <Link href={`/tasks/${t.taskId}`}>
                          <p className="font-semibold truncate max-w-[110px]" style={{ color: C.primary }}>{t.title}</p>
                          {t.projectId && projectMap[t.projectId] && (
                            <p className="text-xs truncate max-w-[110px] mt-0.5" style={{ color: C.neutral }}>{projectMap[t.projectId]}</p>
                          )}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-2 whitespace-nowrap">
                        <span className="font-bold" style={{ color: dlColor }}>{dlText}</span>
                      </td>
                      <td className="py-2.5">
                        <PriorityBadge priority={t.priority} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Recent Activity + Analytics */}
      <div className="grid grid-cols-5 gap-5">

        {/* Recent Activity */}
        <Card className="col-span-3 p-5">
          <SectionTitle>Recent Activity</SectionTitle>
          {activity.length === 0 ? (
            <p className="text-sm" style={{ color: C.neutral }}>No recent activity.</p>
          ) : (
            <div className="space-y-4">
              {activity.slice(0, 6).map((a, i) => {
                const log       = a as { logId?: string; taskId?: string; toStatus?: string; changedBy?: string; changedAt?: string; createdAt?: string };
                const taskTitle = tasks.find(t => t.taskId === log.taskId)?.title ?? log.taskId?.slice(0, 12) ?? "a task";
                const toStatus  = log.toStatus ?? "";
                const timestamp = log.changedAt ?? log.createdAt ?? "";
                const actorName = log.changedBy === userId ? displayName : displayName;
                return (
                  <div key={log.logId ?? i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                         style={{ background: C.primary }}>
                      {actorName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold" style={{ color: C.primary }}>{actorName}</span>
                        {" moved "}
                        <Link href={`/tasks/${log.taskId}`} className="font-semibold hover:underline" style={{ color: C.primary }}>
                          {taskTitle}
                        </Link>
                        {" to "}
                        <span className="font-semibold" style={{ color: STATUS_COLOR[toStatus] ?? C.primary }}>{toStatus}</span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: C.neutral + "99" }}>{timestamp ? timeAgo(timestamp) : ""}</p>
                    </div>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-2"
                          style={{ background: STATUS_COLOR[toStatus] ?? C.neutral }} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Analytics Overview */}
        <Card className="col-span-2 p-5">
          <SectionTitle>Analytics Overview</SectionTitle>

          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.neutral }}>By Status</p>
          <div className="space-y-2.5 mb-5">
            {[
              { label: "To Do",       color: C.neutral, count: myTasks.filter(t => t.status === "To Do").length       },
              { label: "In Progress", color: C.blue,    count: myTasks.filter(t => t.status === "In Progress").length },
              { label: "In Review",   color: C.accent,  count: myTasks.filter(t => t.status === "In Review").length   },
              { label: "Done",        color: C.primary, count: myTasks.filter(t => t.status === "Done").length        },
            ].map(({ label, color, count }) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="text-xs font-medium w-20 flex-shrink-0" style={{ color: C.neutral }}>{label}</span>
                <ProgressBar pct={myTasks.length ? (count / myTasks.length) * 100 : 0} color={color} />
                <span className="text-xs font-bold w-4 text-right" style={{ color: C.primary }}>{count}</span>
              </div>
            ))}
          </div>

          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: C.neutral }}>By Priority</p>
          <div className="space-y-2.5">
            {(["Critical", "High", "Medium", "Low"] as const).map(p => {
              const count = myActive.filter(t => t.priority === p).length;
              return (
                <div key={p} className="flex items-center gap-2.5">
                  <span className="text-xs font-medium w-14 flex-shrink-0" style={{ color: C.neutral }}>{p}</span>
                  <ProgressBar pct={myActive.length ? (count / myActive.length) * 100 : 0} color={PRIORITY_COLOR[p]} />
                  <span className="text-xs font-bold w-4 text-right" style={{ color: C.primary }}>{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    const isManager = user.role === "manager";
    Promise.all([
      api.get("/tasks").then(r => r.data as Task[]),
      api.get("/projects").then(r => r.data as Project[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
      api.get("/activity").then(r => r.data).catch(() => []),
    ]).then(([t, p, tm, u, a]) => {
      setTasks((t as Task[]).map(task => ({ ...task, status: normalizeStatus(task.status) as Task["status"] })));
      setProjects(p); setTeams(tm); setUsers(u);
      setActivity(Array.isArray(a) ? a : []);
    }).finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: C.accent }} />
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      {user?.role === "manager" ? (
        <ManagerDashboard tasks={tasks} teams={teams} users={users} projects={projects} activity={activity} />
      ) : (
        <EmployeeDashboard
          tasks={tasks} projects={projects} activity={activity}
          userId={user?.userId ?? ""}
          userName={user?.name || user?.email?.split("@")[0] || "there"}
        />
      )}
    </ProtectedLayout>
  );
}
