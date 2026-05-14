"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Project, Task, Team, User } from "@/types";

const STATUS_CONFIG = {
  "To Do":       { dot: "#6b7280", bg: "rgba(107,114,128,0.10)", text: "#8a8f96" },
  "In Progress": { dot: "#3d6b9e", bg: "rgba(61,107,158,0.12)",  text: "#5a8ab8" },
  "In Review":   { dot: "#8a6a1e", bg: "rgba(138,106,30,0.14)",  text: "#a88340" },
  "Done":        { dot: "#2d6e52", bg: "rgba(45,110,82,0.14)",   text: "#4a9070" },
} as const;

const PRIORITY_CONFIG = {
  Critical: { dot: "#8b3535", text: "#b05555" },
  High:     { dot: "#7a4a25", text: "#9e6840" },
  Medium:   { dot: "#7a6520", text: "#9e8438" },
  Low:      { dot: "#6b7280", text: "#9ca3af" },
} as const;

const KANBAN_COLS = ["To Do", "In Progress", "In Review", "Done"] as const;

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const ini = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center font-semibold bg-surface-container-highest border border-outline-variant text-on-surface flex-shrink-0"
         style={{ width: size, height: size, fontSize: size < 28 ? 9 : 11 }}>
      {ini}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant px-5 py-4">
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-on-surface tracking-tight">{value}</p>
      {sub && <p className="text-xs text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const isManager = user?.role === "manager";

  const [project,  setProject]  = useState<Project | null>(null);
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [team,     setTeam]     = useState<Team | null>(null);
  const [users,    setUsers]    = useState<User[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [pageError,setPageError]= useState("");

  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [confirmDel, setConfirmDel]     = useState(false);
  const [deleting,   setDeleting]       = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get(`/projects/${projectId}`).then(r => r.data as Project),
      api.get("/tasks").then(r => (r.data as Task[]).filter(t => t.projectId === projectId)),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
    ]).then(([p, t, u]) => {
      setProject(p); setTasks(t); setUsers(u);
      if (isManager && p.teamId) {
        api.get(`/teams/${p.teamId}`).then(r => setTeam(r.data as Team)).catch(() => null);
      }
    }).catch(() => setPageError("Failed to load project."))
      .finally(() => setLoading(false));
  }, [projectId, user, isManager]);

  const getUserName = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u?.name || u?.email?.split("@")[0] || id.slice(0, 8);
  };

  const isOverdue = (t: Task) =>
    t.deadline && normalizeStatus(t.status) !== "Done" && new Date(t.deadline) < new Date();

  const filteredTasks = tasks.filter(t =>
    statusFilter === "All" ? true : normalizeStatus(t.status) === statusFilter
  );

  const done     = tasks.filter(t => normalizeStatus(t.status) === "Done").length;
  const total    = tasks.length;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue  = tasks.filter(t => isOverdue(t)).length;

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/projects/${projectId}`);
      router.push("/projects");
    } catch { setDeleting(false); setConfirmDel(false); }
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

  if (pageError || !project) {
    return (
      <ProtectedLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-sm text-on-surface-variant">{pageError || "Project not found."}</p>
          <Link href="/projects" className="text-sm text-on-surface hover:text-primary transition-colors">← Back to Projects</Link>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-6">
        <Link href="/projects" className="hover:text-on-surface transition-colors">Projects</Link>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className="text-on-surface truncate max-w-xs">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-on-surface-variant mt-1 leading-relaxed max-w-2xl">{project.description}</p>
          )}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {team && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant">
                {team.name}
              </span>
            )}
            <span className="text-xs text-on-surface-variant/60">
              Created {formatDate(project.createdAt)}
            </span>
          </div>
        </div>

        {isManager && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`/projects`}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </Link>
            {confirmDel ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setConfirmDel(false)}
                  className="px-3.5 py-2 rounded-lg text-sm border border-outline-variant text-on-surface-variant hover:bg-surface-container-high transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ background: "#7a2e2e" }}>
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors text-error border"
                style={{ borderColor: "rgba(255,180,171,0.2)", background: "rgba(255,180,171,0.05)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Tasks" value={total} />
        <StatCard label="Completed" value={done} sub={total > 0 ? `${pct}% of total` : undefined} />
        <StatCard label="In Progress" value={tasks.filter(t => normalizeStatus(t.status) === "In Progress").length} />
        <StatCard label="Overdue" value={overdue} sub={overdue > 0 ? "Need attention" : "All on track"} />
      </div>

      {/* Progress bar */}
      <div className="bg-surface-container rounded-xl border border-outline-variant px-5 py-4 mb-6">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-on-surface-variant uppercase tracking-wider">Overall Progress</span>
          <span className="font-bold text-on-surface">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
               style={{
                 width: `${pct}%`,
                 background: pct === 100 ? STATUS_CONFIG["Done"].dot : STATUS_CONFIG["In Progress"].dot,
               }} />
        </div>
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {KANBAN_COLS.map(col => {
            const cfg = STATUS_CONFIG[col];
            const n = tasks.filter(t => normalizeStatus(t.status) === col).length;
            if (!n) return null;
            return (
              <span key={col} className="flex items-center gap-1.5 text-xs" style={{ color: cfg.text }}>
                <span className="w-2 h-2 rounded-full" style={{ background: cfg.dot }} />
                {col} · {n}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tasks section */}
      <div className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden">
        {/* Tasks header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant bg-surface-container-high/40">
          <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Tasks
            {filteredTasks.length > 0 && (
              <span className="ml-2 font-normal normal-case tracking-normal text-on-surface-variant/60">
                ({filteredTasks.length})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-1.5">
            {(["All", ...KANBAN_COLS] as string[]).map(s => {
              const active = statusFilter === s;
              const cfg = s !== "All" ? STATUS_CONFIG[s as keyof typeof STATUS_CONFIG] : null;
              return (
                <button key={s} type="button" onClick={() => setStatusFilter(s)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: active ? (cfg ? cfg.bg : "rgba(255,255,255,0.08)") : "transparent",
                    color: active ? (cfg ? cfg.text : "#e5e2e1") : "#8e9192",
                    border: `1px solid ${active ? (cfg ? cfg.dot + "40" : "#8e9192") : "transparent"}`,
                  }}>
                  {s}
                </button>
              );
            })}
            {isManager && (
              <Link href={`/tasks/new`}
                className="ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Task
              </Link>
            )}
          </div>
        </div>

        {/* Task list */}
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            </div>
            <p className="text-sm text-on-surface-variant">
              {statusFilter === "All" ? "No tasks in this project yet." : `No "${statusFilter}" tasks.`}
            </p>
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div className="grid text-xs font-semibold uppercase tracking-wider px-5 py-2.5 text-on-surface-variant border-b border-outline-variant/50"
                 style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
              <span>Task</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Deadline</span>
            </div>

            {filteredTasks.map((t, i) => {
              const status  = normalizeStatus(t.status);
              const scfg    = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
              const pcfg    = PRIORITY_CONFIG[t.priority as keyof typeof PRIORITY_CONFIG];
              const overdue = isOverdue(t);
              const name    = t.assigneeId ? getUserName(t.assigneeId) : null;

              return (
                <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                  className="grid items-center px-5 py-3.5 hover:bg-surface-container-high/50 transition-colors group"
                  style={{
                    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
                    borderBottom: i < filteredTasks.length - 1 ? "1px solid #444748" : "none",
                  }}>

                  <div className="min-w-0 pr-4">
                    <p className="text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">{t.title}</p>
                    {t.description && (
                      <p className="text-xs text-on-surface-variant/60 truncate mt-0.5">{t.description}</p>
                    )}
                  </div>

                  <div>
                    {scfg && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                            style={{ background: scfg.bg, color: scfg.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: scfg.dot }} />
                        {status}
                      </span>
                    )}
                  </div>

                  <div>
                    {pcfg && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                            style={{ background: pcfg.dot + "18", color: pcfg.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: pcfg.dot }} />
                        {t.priority}
                      </span>
                    )}
                  </div>

                  <div>
                    {name ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={name} size={22} />
                        <span className="text-xs text-on-surface truncate">{name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-on-surface-variant/40">Unassigned</span>
                    )}
                  </div>

                  <div>
                    {t.deadline ? (
                      <span className="text-xs font-medium" style={{ color: overdue ? "#b05555" : "#8e9192" }}>
                        {formatDate(t.deadline)}
                        {overdue && <span className="ml-1 text-[10px]">· Overdue</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-on-surface-variant/40">—</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </ProtectedLayout>
  );
}
