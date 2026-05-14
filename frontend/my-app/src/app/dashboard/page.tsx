"use client";

import { useEffect, useState } from "react";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Task, Team, User, Project } from "@/types";
import Link from "next/link";

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86400000);
}

// Priority dot color
const PRIORITY_DOT: Record<string, string> = {
  Critical: "#8b3535",
  High:     "#7a4a25",
  Medium:   "#7a6520",
  Low:      "#6b7280",
};

// ── Shared atoms ──────────────────────────────────────────────────────────────
function MetricCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface-container rounded-xl p-6 border border-outline-variant flex items-center justify-between group hover:border-outline transition-colors ${className}`}>
      {children}
    </div>
  );
}

function KanbanCard({ task, userName, projectName, mine = false }: {
  task: Task; userName: string; projectName?: string; mine?: boolean;
}) {
  return (
    <Link href={`/tasks/${task.taskId}`}
      className="block bg-surface border border-outline-variant rounded-lg p-4 hover:border-outline cursor-pointer transition-all hover:-translate-y-0.5 group"
      style={mine ? { borderColor: "#8e9192" } : {}}>
      <div className="flex justify-between items-start mb-2.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" title={task.priority}
              style={{ background: PRIORITY_DOT[task.priority] ?? "#444748" }} />
      </div>
      <h4 className="text-on-surface font-semibold mb-1 line-clamp-2 group-hover:text-primary transition-colors" style={{ fontSize: 14, lineHeight: "1.5" }}>
        {task.title}
      </h4>
      {task.description && (
        <p className="text-on-surface-variant line-clamp-2 mb-2" style={{ fontSize: 12, lineHeight: "1.5" }}>
          {task.description}
        </p>
      )}
      <div className="flex items-center justify-between pt-3 border-t border-outline-variant/50 gap-2">
        {projectName ? (
          <span className="text-xs px-2 py-0.5 rounded bg-surface-container border border-outline-variant/60 text-on-surface-variant truncate max-w-[120px]">
            {projectName}
          </span>
        ) : <span />}
        {task.assigneeId && (
          <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface font-semibold flex-shrink-0"
               style={{ fontSize: 10 }} title={userName}>
            {userName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </Link>
  );
}

function KanbanColumn({ label, count, tasks, users, userId, projectMap = {} }: {
  label: string; count: number; tasks: Task[];
  users: User[]; userId?: string; projectMap?: Record<string, string>;
}) {
  const isDone = label === "Done";
  const getName = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u?.name ?? u?.email?.split("@")[0] ?? id.slice(0, 6);
  };

  return (
    <div className={`flex-1 bg-surface-container/50 rounded-xl border border-outline-variant/50 flex flex-col min-h-[500px] ${isDone ? "opacity-70 hover:opacity-100 transition-opacity" : ""}`}>
      <div className="p-4 border-b border-outline-variant/50 flex justify-between items-center bg-surface-container-low/80 rounded-t-xl">
        <div className="flex items-center gap-2">
          <h2 className="text-primary font-bold" style={{ fontSize: 12, letterSpacing: "0.01em" }}>{label}</h2>
          <span className="bg-surface-container-highest text-on-surface-variant px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600 }}>
            {count}
          </span>
        </div>
        <button className="text-on-surface-variant hover:text-primary transition-colors p-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
          </svg>
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3 overflow-y-auto flex-1">
        {isDone && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 opacity-40">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              {count} task{count !== 1 ? "s" : ""} completed
            </span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant/40">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            <span style={{ fontSize: 11 }}>No tasks</span>
          </div>
        ) : (
          tasks.slice(0, 6).map(t => (
            <KanbanCard key={t.taskId} task={t}
              userName={t.assigneeId ? getName(t.assigneeId) : ""}
              projectName={t.projectId ? projectMap[t.projectId] : undefined}
              mine={t.assigneeId === userId}
            />
          ))
        )}
        {tasks.length > 6 && (
          <Link href="/tasks"
            className="text-center py-2 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container-high"
            style={{ fontSize: 12, fontWeight: 500 }}>
            +{tasks.length - 6} more
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Manager Dashboard ─────────────────────────────────────────────────────────
function ManagerDashboard({ tasks, teams, users, projects }: {
  tasks: Task[]; teams: Team[]; users: User[]; projects: Project[];
}) {
  const active     = tasks.filter(t => t.status !== "Done");
  const overdue    = tasks.filter(t => isOverdue(t));
  const projectMap = Object.fromEntries(projects.map(p => [p.projectId, p.name]));

  const avgClose = (() => {
    const closed = tasks.filter(t => t.status === "Done" && t.createdAt && t.updatedAt);
    if (!closed.length) return null;
    const avg = closed.reduce((s, t) =>
      s + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()), 0) / closed.length;
    return (avg / 86400000).toFixed(1);
  })();

  // Top team by task volume
  const topTeam = (() => {
    if (!teams.length) return null;
    return teams.map(t => ({ team: t, count: tasks.filter(x => x.teamId === t.teamId).length }))
      .sort((a, b) => b.count - a.count)[0];
  })();

  const teamRows = teams.map(team => {
    const tt   = tasks.filter(t => t.teamId === team.teamId);
    const done = tt.filter(t => t.status === "Done").length;
    const pct  = tt.length ? Math.round((done / tt.length) * 100) : 0;
    return { team, total: tt.length, done, pct };
  });

  const [teamFilter, setTeamFilter] = useState("all");

  const filteredTasks = teamFilter === "all"
    ? tasks
    : tasks.filter(t => t.teamId === teamFilter);

  const kanbanCols = [
    { label: "To Do",       tasks: filteredTasks.filter(t => (t.status as string) === "To Do") },
    { label: "In Progress", tasks: filteredTasks.filter(t => (t.status as string) === "In Progress") },
    { label: "In Review",   tasks: filteredTasks.filter(t => (t.status as string) === "In Review") },
    { label: "Done",        tasks: filteredTasks.filter(t => (t.status as string) === "Done") },
  ];

  // Completion % for the circular arc
  const completionPct = tasks.length ? Math.round((tasks.filter(t => (t.status as string) === "Done").length / tasks.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-8">

      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-outline-variant pb-6">
        <div>
          <h1 className="text-primary font-semibold tracking-tight" style={{ fontSize: 32, lineHeight: "1.2", letterSpacing: "-0.02em" }}>
            Company Overview
          </h1>
          <p className="text-on-surface-variant mt-1" style={{ fontSize: 16, lineHeight: "1.6" }}>
            Manage cross-functional team priorities and track sprint velocity.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-48">
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              className="w-full appearance-none bg-surface-container border border-outline-variant text-on-surface py-2 pl-3 pr-10 rounded-lg focus:outline-none focus:border-outline cursor-pointer transition-colors"
              style={{ fontSize: 14 }}>
              <option value="all">All Teams</option>
              {teams.map(t => (
                <option key={t.teamId} value={t.teamId}>{t.name}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant" width="16" height="16"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          <button className="p-2 border border-outline-variant rounded-lg text-on-surface-variant hover:text-primary hover:border-outline transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Metrics bento ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Metric 1: Active Tasks */}
        <MetricCard>
          <div>
            <h3 className="text-on-surface-variant mb-1 uppercase tracking-wider" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }}>
              Total Active Tasks
            </h3>
            <div className="text-primary font-semibold" style={{ fontSize: 32, lineHeight: "1.2", letterSpacing: "-0.02em" }}>
              {active.length}
            </div>
            {overdue.length > 0 ? (
              <div className="text-error mt-2 flex items-center gap-1" style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
                {overdue.length} overdue
              </div>
            ) : (
              <div className="text-on-surface-variant mt-2" style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
                All on track
              </div>
            )}
          </div>
          {/* Circular progress */}
          <div className="w-16 h-16 relative flex items-center justify-center flex-shrink-0">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path className="text-surface-container-highest" fill="none" stroke="currentColor" strokeWidth="3"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    strokeDasharray="100, 100"/>
              <path className="text-primary" fill="none" stroke="currentColor" strokeWidth="3"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    strokeDasharray={`${completionPct}, 100`}/>
            </svg>
            <span className="text-primary font-bold relative" style={{ fontSize: 12, letterSpacing: "0.01em" }}>
              {completionPct}%
            </span>
          </div>
        </MetricCard>

        {/* Metric 2: Avg time-to-close */}
        <MetricCard>
          <div>
            <h3 className="text-on-surface-variant mb-1 uppercase tracking-wider" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }}>
              Avg Time-to-Close
            </h3>
            <div className="flex items-baseline gap-2">
              <span className="text-primary font-semibold" style={{ fontSize: 32, lineHeight: "1.2", letterSpacing: "-0.02em" }}>
                {avgClose ?? "—"}
              </span>
              {avgClose && <span className="text-on-surface-variant font-medium" style={{ fontSize: 20, lineHeight: "1.4", letterSpacing: "-0.01em" }}>days</span>}
            </div>
            <div className="text-primary mt-2 flex items-center gap-1" style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              {tasks.filter(t => t.status === "Done").length} tasks closed
            </div>
          </div>
          {/* Bar chart sparkline */}
          <div className="flex items-end gap-1 h-12 flex-shrink-0">
            {[4, 6, 5, 8, 12].map((h, i) => (
              <div key={i} className={`w-2 rounded-t ${i === 4 ? "bg-primary" : i === 3 ? "bg-primary-container" : "bg-surface-container-highest"}`}
                   style={{ height: `${h * 4}px` }} />
            ))}
          </div>
        </MetricCard>

        {/* Metric 3: Tasks by team */}
        <MetricCard>
          <div>
            <h3 className="text-on-surface-variant mb-1 uppercase tracking-wider" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }}>
              Tasks by Team
            </h3>
            <div className="text-primary font-semibold" style={{ fontSize: 32, lineHeight: "1.2", letterSpacing: "-0.02em" }}>
              {topTeam?.team.name ?? "—"}
            </div>
            <div className="text-on-surface-variant mt-2" style={{ fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
              Highest volume currently
            </div>
          </div>
          {/* Progress bars */}
          <div className="flex flex-col gap-2 w-1/3 flex-shrink-0">
            {teamRows.slice(0, 3).map((r, i) => (
              <div key={r.team.teamId} className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{
                       width: `${r.pct}%`,
                       background: i === 0 ? "#ffffff" : i === 1 ? "#e2e2e2" : "#8e9192",
                     }} />
              </div>
            ))}
          </div>
        </MetricCard>
      </div>

      {/* ── Kanban board ── */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-6 min-w-[900px]">
          {kanbanCols.map(col => (
            <KanbanColumn
              key={col.label}
              label={col.label}
              count={col.tasks.length}
              tasks={col.tasks}
              users={users}
              projectMap={projectMap}
            />
          ))}
        </div>
      </div>

      {/* ── Bottom: Team performance + projects ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Team performance */}
        <div className="bg-surface-container rounded-xl border border-outline-variant p-6">
          <h2 className="text-primary font-semibold mb-5" style={{ fontSize: 14, letterSpacing: "-0.01em" }}>Team Performance</h2>
          {teamRows.length === 0 ? (
            <p className="text-on-surface-variant" style={{ fontSize: 14 }}>No teams yet.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {teamRows.map(r => (
                <div key={r.team.teamId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-on-surface font-medium" style={{ fontSize: 14 }}>{r.team.name}</span>
                    <span className="text-primary font-bold" style={{ fontSize: 12, letterSpacing: "0.01em" }}>{r.pct}%</span>
                  </div>
                  <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden mb-1">
                    <div className="bg-primary h-full rounded-full transition-all duration-700" style={{ width: `${r.pct}%` }} />
                  </div>
                  <div className="flex items-center gap-4 text-on-surface-variant" style={{ fontSize: 11, fontWeight: 600 }}>
                    <span>{r.total} tasks</span>
                    <span className="text-primary">{r.done} done</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="bg-surface-container rounded-xl border border-outline-variant p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-primary font-semibold" style={{ fontSize: 14, letterSpacing: "-0.01em" }}>Projects</h2>
            <Link href="/projects" className="text-on-surface-variant hover:text-primary transition-colors" style={{ fontSize: 12, fontWeight: 500 }}>
              View all
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="text-on-surface-variant" style={{ fontSize: 14 }}>No projects yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {projects.slice(0, 5).map(p => {
                const pt  = tasks.filter(t => t.projectId === p.projectId);
                const pct = pt.length ? Math.round((pt.filter(t => t.status === "Done").length / pt.length) * 100) : 0;
                return (
                  <Link key={p.projectId} href="/projects" className="flex items-center gap-3 group">
                    <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-on-surface font-bold flex-shrink-0"
                         style={{ fontSize: 12 }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-on-surface font-medium truncate group-hover:text-primary transition-colors" style={{ fontSize: 13 }}>{p.name}</p>
                        <span className="text-on-surface-variant ml-2 flex-shrink-0" style={{ fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div className="w-full bg-surface-container-highest rounded-full h-1 overflow-hidden">
                        <div className="bg-primary h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Employee Dashboard ────────────────────────────────────────────────────────
function EmployeeDashboard({ tasks, projects, userId, displayName }: {
  tasks: Task[]; projects: Project[]; userId: string; displayName: string;
}) {
  const myTasks   = tasks.filter(t => t.assigneeId === userId);
  const myActive  = myTasks.filter(t => (t.status as string) !== "Done");
  const myOverdue = myTasks.filter(t => isOverdue(t));
  const today     = new Date().toISOString().split("T")[0];
  const dueToday  = myActive.filter(t => t.deadline?.startsWith(today));
  const completed = myTasks.filter(t => (t.status as string) === "Done");
  const inReview  = myTasks.filter(t => (t.status as string) === "In Review");

  const projectMap = Object.fromEntries(projects.map(p => [p.projectId, p.name]));

  const dueSoon = myActive
    .filter(t => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 5);

  const kanbanCols = [
    { label: "To Do",       tasks: tasks.filter(t => (t.status as string) === "To Do") },
    { label: "In Progress", tasks: tasks.filter(t => (t.status as string) === "In Progress") },
    { label: "In Review",   tasks: tasks.filter(t => (t.status as string) === "In Review") },
    { label: "Done",        tasks: tasks.filter(t => (t.status as string) === "Done") },
  ];

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ── */}
      <div className="border-b border-outline-variant pb-6">
        <h1 className="text-primary font-semibold tracking-tight" style={{ fontSize: 32, lineHeight: "1.2", letterSpacing: "-0.02em" }}>
          My Workspace
        </h1>
        <p className="text-on-surface-variant mt-1" style={{ fontSize: 16, lineHeight: "1.6" }}>
          {dueToday.length > 0
            ? `${dueToday.length} task${dueToday.length !== 1 ? "s" : ""} due today — stay focused, ${displayName}.`
            : myOverdue.length > 0
              ? `${myOverdue.length} overdue task${myOverdue.length !== 1 ? "s" : ""} need your attention.`
              : `You're all caught up, ${displayName}.`}
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Assigned", value: myTasks.length },
          { label: "Due Today", value: dueToday.length, highlight: dueToday.length > 0 },
          { label: "Completed", value: completed.length },
          { label: "In Review", value: inReview.length },
        ].map(({ label, value, highlight }) => (
          <div key={label} className="bg-surface-container rounded-xl border border-outline-variant p-5 hover:border-outline transition-colors">
            <div className="text-primary font-semibold" style={{ fontSize: 32, lineHeight: "1.2", letterSpacing: "-0.02em",
              ...(highlight ? { color: "#ffb4ab" } : {}) }}>
              {value}
            </div>
            <div className="text-on-surface-variant mt-1" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em" }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Kanban board ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-primary font-semibold" style={{ fontSize: 14 }}>Team Board</h2>
          <Link href="/tasks" className="text-on-surface-variant hover:text-primary transition-colors" style={{ fontSize: 12, fontWeight: 500 }}>
            Open full board →
          </Link>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-6 min-w-[900px]">
            {kanbanCols.map(col => (
              <KanbanColumn key={col.label} label={col.label} count={col.tasks.length}
                tasks={col.tasks} users={[]} userId={userId} projectMap={projectMap} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Due soon + analytics ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Due soon */}
        <div className="bg-surface-container rounded-xl border border-outline-variant p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-primary font-semibold" style={{ fontSize: 14 }}>Due Soon</h2>
            <Link href="/tasks" className="text-on-surface-variant hover:text-primary transition-colors" style={{ fontSize: 12, fontWeight: 500 }}>View all</Link>
          </div>
          {dueSoon.length === 0 ? (
            <p className="text-on-surface-variant" style={{ fontSize: 14 }}>No upcoming deadlines.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {dueSoon.map(t => {
                const days = deadlineDays(t.deadline!);
                const dlText = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`;
                const isUrgent = days <= 1;
                return (
                  <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                    className="flex items-center gap-3 py-2 border-b border-outline-variant/50 last:border-0 hover:text-primary transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-on-surface font-medium truncate group-hover:text-primary transition-colors" style={{ fontSize: 13 }}>{t.title}</p>
                      {t.projectId && projectMap[t.projectId] && (
                        <p className="text-on-surface-variant truncate" style={{ fontSize: 11 }}>{projectMap[t.projectId]}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 font-bold" style={{ fontSize: 12, color: isUrgent ? "#ffb4ab" : "#8e9192" }}>
                      {dlText}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Analytics */}
        <div className="bg-surface-container rounded-xl border border-outline-variant p-6">
          <h2 className="text-primary font-semibold mb-5" style={{ fontSize: 14 }}>My Analytics</h2>
          <p className="text-on-surface-variant uppercase tracking-wider mb-3" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.01em" }}>
            By Status
          </p>
          <div className="flex flex-col gap-3 mb-6">
            {[
              { label: "To Do",       count: myTasks.filter(t => (t.status as string) === "To Do").length },
              { label: "In Progress", count: myTasks.filter(t => (t.status as string) === "In Progress").length },
              { label: "In Review",   count: myTasks.filter(t => (t.status as string) === "In Review").length },
              { label: "Done",        count: myTasks.filter(t => (t.status as string) === "Done").length },
            ].map(({ label, count }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-on-surface-variant w-20 flex-shrink-0" style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
                <div className="flex-1 bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full transition-all duration-700"
                       style={{ width: myTasks.length ? `${(count / myTasks.length) * 100}%` : "0%" }} />
                </div>
                <span className="text-primary font-bold w-4 text-right" style={{ fontSize: 12 }}>{count}</span>
              </div>
            ))}
          </div>
          <p className="text-on-surface-variant uppercase tracking-wider mb-3" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.01em" }}>
            By Priority
          </p>
          <div className="flex flex-col gap-3">
            {(["Critical", "High", "Medium", "Low"] as const).map(p => {
              const count = myActive.filter(t => t.priority === p).length;
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className="text-on-surface-variant w-14 flex-shrink-0" style={{ fontSize: 12, fontWeight: 500 }}>{p}</span>
                  <div className="flex-1 bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary-container h-full rounded-full transition-all duration-700"
                         style={{ width: myActive.length ? `${(count / myActive.length) * 100}%` : "0%" }} />
                  </div>
                  <span className="text-primary font-bold w-4 text-right" style={{ fontSize: 12 }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    const isManager = user.role === "manager";
    Promise.all([
      api.get("/tasks").then(r => r.data as Task[]),
      api.get("/projects").then(r => r.data as Project[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
    ]).then(([t, p, tm, u]) => {
      setTasks((t as Task[]).map(task => ({ ...task, status: normalizeStatus(task.status) as Task["status"] })));
      setProjects(p); setTeams(tm); setUsers(u);
    }).finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      {user?.role === "manager" ? (
        <ManagerDashboard tasks={tasks} teams={teams} users={users} projects={projects} />
      ) : (
        <EmployeeDashboard
          tasks={tasks} projects={projects}
          userId={user?.userId ?? ""}
          displayName={user?.name || user?.email?.split("@")[0] || "there"}
        />
      )}
    </ProtectedLayout>
  );
}
