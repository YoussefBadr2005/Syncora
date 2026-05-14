"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Task, Project, Team, User } from "@/types";

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

const STATUSES   = ["All", "To Do", "In Progress", "In Review", "Done"];
const PRIORITIES = ["All", "Critical", "High", "Medium", "Low"];

const KANBAN_COLS = ["To Do", "In Progress", "In Review", "Done"] as const;

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
}

// ── Dropdown filter ───────────────────────────────────────────────────────────
function FilterDropdown({ options, value, onChange, label }: {
  options: string[]; value: string; onChange: (v: string) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const active = value !== options[0];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border"
        style={{
          background: active ? "rgba(255,255,255,0.06)" : "transparent",
          borderColor: active ? "#8e9192" : "#444748",
          color: active ? "#e5e2e1" : "#8e9192",
        }}>
        <span style={{ fontSize: 13 }}>{active ? value : label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg z-50 overflow-hidden"
             style={{ minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {options.map(o => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-container-high transition-colors flex items-center gap-2"
              style={{ color: o === value ? "#e5e2e1" : "#8e9192", fontWeight: o === value ? 600 : 400 }}>
              {o}
              {o === value && (
                <svg className="ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke="#e5e2e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

export default function TasksPage() {
  const { user } = useAuth();
  const searchParams   = useSearchParams();
  const projectParam   = searchParams.get("project");

  const [tasks, setTasks]       = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams]       = useState<Team[]>([]);
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter]     = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [teamFilter, setTeamFilter]         = useState("All");
  const [projectFilter, setProjectFilter]   = useState(projectParam ?? "");
  const [view, setView] = useState<"board" | "list">("board");

  // drag
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const isManager = user.role === "manager";
    Promise.all([
      api.get("/tasks").then(r => r.data as Task[]),
      api.get("/projects").then(r => r.data as Project[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
    ]).then(([t, p, tm, u]) => {
      setTasks(t.map(task => ({ ...task, status: normalizeStatus(task.status) as Task["status"] })));
      setProjects(p); setTeams(tm); setUsers(u);
    }).finally(() => setLoading(false));
  }, [user]);

  const projectMap  = Object.fromEntries(projects.map(p => [p.projectId, p.name]));
  const teamMap     = Object.fromEntries(teams.map(t => [t.teamId, t.name]));
  const getUserName = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u?.name || u?.email?.split("@")[0] || id.slice(0, 6);
  };
  const isOverdue = (t: Task) =>
    t.deadline && normalizeStatus(t.status) !== "Done" && new Date(t.deadline) < new Date();

  const filtered = tasks.filter(t => {
    if (statusFilter !== "All"   && normalizeStatus(t.status) !== statusFilter) return false;
    if (priorityFilter !== "All" && t.priority !== priorityFilter)               return false;
    if (teamFilter !== "All"     && teamMap[t.teamId] !== teamFilter)            return false;
    if (projectFilter            && t.projectId !== projectFilter)               return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.description?.toLowerCase().includes(search.toLowerCase()))            return false;
    return true;
  });

  const activeProject = projectFilter ? projects.find(p => p.projectId === projectFilter) : null;
  const hasFilters = statusFilter !== "All" || priorityFilter !== "All" || teamFilter !== "All" || !!search || !!projectFilter;
  const clearFilters = () => { setStatusFilter("All"); setPriorityFilter("All"); setTeamFilter("All"); setSearch(""); setProjectFilter(""); };

  // drag handlers
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

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          {activeProject && (
            <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-1.5">
              <Link href="/projects" className="hover:text-on-surface transition-colors">Projects</Link>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span className="text-on-surface">{activeProject.name}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">
            {activeProject ? activeProject.name : user?.role === "manager" ? "Tasks" : "My Tasks"}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {filtered.length}{tasks.length !== filtered.length ? ` of ${tasks.length}` : ""} task{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-outline-variant">
            {([
              { id: "board", icon: <><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="5" height="7" rx="1"/></> },
              { id: "list",  icon: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></> },
            ] as const).map(v => (
              <button key={v.id} type="button" onClick={() => setView(v.id)}
                className="flex items-center justify-center w-9 h-9 transition-colors"
                style={{
                  background: view === v.id ? "rgba(255,255,255,0.08)" : "transparent",
                  color: view === v.id ? "#e5e2e1" : "#8e9192",
                }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {v.icon}
                </svg>
              </button>
            ))}
          </div>

          {user?.role === "manager" && (
            <Link href="/tasks/new"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Task
            </Link>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
               viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 focus:border-outline focus:ring-0 focus:outline-none transition-colors"
            style={{ width: 220 }} />
        </div>

        <FilterDropdown options={STATUSES}   value={statusFilter}   onChange={setStatusFilter}   label="Status"   />
        <FilterDropdown options={PRIORITIES} value={priorityFilter} onChange={setPriorityFilter} label="Priority" />
        {teams.length > 0 && (
          <FilterDropdown options={["All", ...teams.map(t => t.name)]} value={teamFilter} onChange={setTeamFilter} label="Team" />
        )}

        {hasFilters && (
          <button type="button" onClick={clearFilters}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline transition-colors">
            Clear
          </button>
        )}

        {/* Summary pills */}
        <div className="ml-auto hidden lg:flex items-center gap-2">
          {KANBAN_COLS.map(col => {
            const cfg = STATUS_CONFIG[col];
            const count = filtered.filter(t => normalizeStatus(t.status) === col).length;
            if (count === 0) return null;
            return (
              <span key={col} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                    style={{ background: cfg.bg, color: cfg.text }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                {col} · {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">No tasks match your filters</p>
            {hasFilters && <p className="text-xs text-on-surface-variant mt-1">Try adjusting or clearing your filters.</p>}
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ══ BOARD VIEW ══ */}
      {filtered.length > 0 && view === "board" && (
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
                  ) : colTasks.map(t => {
                    const overdue = isOverdue(t);
                    const isDragging = draggingId === t.taskId;
                    const pcfg = PRIORITY_CONFIG[t.priority as keyof typeof PRIORITY_CONFIG];
                    return (
                      <div key={t.taskId}
                        draggable
                        onDragStart={e => handleDragStart(e, t.taskId)}
                        onDragEnd={handleDragEnd}
                        style={{ opacity: isDragging ? 0.35 : 1, cursor: "grab" }}
                      >
                        <Link href={`/tasks/${t.taskId}`} draggable={false}
                          onClick={e => { if (isDragging) e.preventDefault(); }}
                          className="block rounded-lg p-3.5 border border-outline-variant bg-surface hover:border-outline hover:shadow-lg transition-all group"
                          style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>

                          {/* Title + drag dots */}
                          <div className="flex items-start gap-2 mb-2.5">
                            <p className="text-sm font-medium text-on-surface leading-snug flex-1 group-hover:text-primary transition-colors">{t.title}</p>
                            <svg width="10" height="10" viewBox="0 0 10 16" fill="#444748" className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <circle cx="2.5" cy="2" r="1.5"/><circle cx="7.5" cy="2" r="1.5"/>
                              <circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>
                              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
                            </svg>
                          </div>

                          {t.description && (
                            <p className="text-xs text-on-surface-variant leading-relaxed mb-2.5 line-clamp-2">{t.description}</p>
                          )}

                          {t.projectId && projectMap[t.projectId] && (
                            <div className="mb-2.5">
                              <span className="text-[11px] px-2 py-0.5 rounded bg-surface-container border border-outline-variant/60 text-on-surface-variant">
                                {projectMap[t.projectId]}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2">
                            <PriorityBadge priority={t.priority} />
                            <div className="flex items-center gap-2">
                              {t.deadline && (
                                <span className="text-[11px]" style={{ color: overdue ? "#b05555" : "#8e9192" }}>
                                  {new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                              {t.assigneeId && (
                                <div className="w-5 h-5 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface font-semibold"
                                     style={{ fontSize: 9 }}
                                     title={getUserName(t.assigneeId)}>
                                  {getUserName(t.assigneeId).charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {filtered.length > 0 && view === "list" && (
        <div className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden">
          {/* Header row */}
          <div className="grid text-xs font-semibold uppercase tracking-wider px-5 py-3 text-on-surface-variant border-b border-outline-variant bg-surface-container-high/40"
               style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr" }}>
            <span>Task</span><span>Status</span><span>Priority</span>
            <span>Assignee</span><span>Project</span><span>Deadline</span>
          </div>

          {filtered.map((t, i) => {
            const overdue = isOverdue(t);
            const status = normalizeStatus(t.status);
            const scfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
            return (
              <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                className="grid items-center px-5 py-3.5 hover:bg-surface-container-high/50 transition-colors group"
                style={{
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
                  borderBottom: i < filtered.length - 1 ? "1px solid #444748" : "none",
                }}>
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-medium text-on-surface truncate group-hover:text-primary transition-colors">{t.title}</p>
                  {teamMap[t.teamId] && (
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">{teamMap[t.teamId]}</p>
                  )}
                </div>
                <div>
                  {scfg && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs"
                          style={{ background: scfg.bg, color: scfg.text }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: scfg.dot }} />
                      {status}
                    </span>
                  )}
                </div>
                <div><PriorityBadge priority={t.priority} /></div>
                <div>
                  {t.assigneeId ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface font-semibold flex-shrink-0" style={{ fontSize: 10 }}>
                        {getUserName(t.assigneeId).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-on-surface truncate">{getUserName(t.assigneeId)}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-on-surface-variant/40">—</span>
                  )}
                </div>
                <div>
                  {projectMap[t.projectId] ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-container border border-outline-variant/60 text-on-surface-variant">
                      {projectMap[t.projectId]}
                    </span>
                  ) : (
                    <span className="text-sm text-on-surface-variant/40">—</span>
                  )}
                </div>
                <div>
                  {t.deadline ? (
                    <span className="text-sm font-medium" style={{ color: overdue ? "#b05555" : "#8e9192" }}>
                      {new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  ) : (
                    <span className="text-sm text-on-surface-variant/40">—</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

    </ProtectedLayout>
  );
}
