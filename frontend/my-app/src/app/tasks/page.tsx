"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Task, Project, Team, User } from "@/types";

const C = { primary: "#232F3E", accent: "#FF9900", blue: "#0073BB", neutral: "#64748B" };

const STATUS_COLOR: Record<string, string> = {
  "To Do": C.neutral, "In Progress": C.blue, "In Review": C.accent, "Done": C.primary,
};
const PRIORITY_COLOR: Record<string, string> = {
  Critical: C.primary, High: C.accent, Medium: C.blue, Low: C.neutral,
};
const STATUSES   = ["All", "To Do", "In Progress", "In Review", "Done"];
const PRIORITIES = ["All", "Critical", "High", "Medium", "Low"];

const KANBAN_COLS = [
  { label: "To Do",       color: C.neutral },
  { label: "In Progress", color: C.blue    },
  { label: "In Review",   color: C.accent  },
  { label: "Done",        color: C.primary },
];

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
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

function StatusBadge({ status }: { status: string }) {
  const label = normalizeStatus(status);
  const color = STATUS_COLOR[label] ?? C.neutral;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: color + "15", color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

function FilterBtn({ options, value, onChange, label }: {
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
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all bg-white"
        style={{ border: `1.5px solid ${active ? C.accent : "#E2E8F0"}`, color: active ? C.accent : C.neutral }}>
        <span>{active ? value : label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl z-50 overflow-hidden"
             style={{ border: "1px solid #E2E8F0", minWidth: 160 }}>
          {options.map(o => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
              style={{ color: o === value ? C.accent : C.primary, fontWeight: o === value ? 600 : 400 }}>
              {o}
              {o === value && (
                <svg className="ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none"
                     stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams]       = useState<Team[]>([]);
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter]     = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [teamFilter, setTeamFilter]         = useState("All");
  const [view, setView] = useState<"list" | "board">("board");

  // drag state
  const [draggingId, setDraggingId]     = useState<string | null>(null);
  const [dragOverCol, setDragOverCol]   = useState<string | null>(null);

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
    if (statusFilter !== "All" && normalizeStatus(t.status) !== statusFilter) return false;
    if (priorityFilter !== "All" && t.priority !== priorityFilter) return false;
    if (teamFilter !== "All" && teamMap[t.teamId] !== teamFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const kanbanCols = KANBAN_COLS.map(col => ({
    ...col,
    tasks: filtered.filter(t => normalizeStatus(t.status) === col.label),
  }));

  const hasFilters = statusFilter !== "All" || priorityFilter !== "All" || teamFilter !== "All" || !!search;

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, colLabel: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;
    const task = tasks.find(t => t.taskId === taskId);
    if (!task || normalizeStatus(task.status) === colLabel) {
      setDraggingId(null); setDragOverCol(null); return;
    }

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.taskId === taskId ? { ...t, status: colLabel as Task["status"] } : t
    ));
    setDraggingId(null); setDragOverCol(null);

    try {
      await api.put(`/tasks/${taskId}`, { status: colLabel });
    } catch {
      // Revert on failure
      setTasks(prev => prev.map(t =>
        t.taskId === taskId ? { ...t, status: task.status } : t
      ));
    }
  };

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

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.primary }}>Tasks</h1>
          <p className="text-sm mt-0.5" style={{ color: C.neutral }}>
            {filtered.length}{tasks.length !== filtered.length ? ` of ${tasks.length}` : ""} task{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1.5px solid #E2E8F0" }}>
            {([
              { id: "board", icon: <><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="5" height="7" rx="1"/></>, label: "Board" },
              { id: "list",  icon: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>, label: "List" },
            ] as const).map(v => (
              <button key={v.id} type="button" onClick={() => setView(v.id as "list" | "board")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{ background: view === v.id ? C.primary : "white", color: view === v.id ? "white" : C.neutral }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {v.icon}
                </svg>
                {v.label}
              </button>
            ))}
          </div>

          {user?.role === "manager" && (
            <Link href="/tasks/new"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: C.accent }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Task
            </Link>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <div className="relative" style={{ minWidth: 240 }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
               viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search tasks…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-white outline-none"
            style={{ border: `1.5px solid ${search ? C.accent : "#E2E8F0"}`, color: C.primary }} />
        </div>

        <FilterBtn options={STATUSES}   value={statusFilter}   onChange={setStatusFilter}   label="Status"   />
        <FilterBtn options={PRIORITIES} value={priorityFilter} onChange={setPriorityFilter} label="Priority" />
        {teams.length > 0 && (
          <FilterBtn options={["All", ...teams.map(t => t.name)]} value={teamFilter} onChange={setTeamFilter} label="Team" />
        )}

        {hasFilters && (
          <button type="button"
            onClick={() => { setStatusFilter("All"); setPriorityFilter("All"); setTeamFilter("All"); setSearch(""); }}
            className="text-xs font-semibold px-3 py-2 rounded-xl transition-colors hover:bg-gray-100"
            style={{ color: C.neutral, border: "1.5px solid #E2E8F0", background: "white" }}>
            Clear filters
          </button>
        )}

        {/* Status summary pills */}
        <div className="ml-auto flex items-center gap-2">
          {KANBAN_COLS.map(col => {
            const count = filtered.filter(t => normalizeStatus(t.status) === col.label).length;
            return (
              <span key={col.label} className="hidden lg:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: col.color + "12", color: col.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: col.color }} />
                {col.label} · {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "44"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p className="text-sm font-semibold" style={{ color: C.neutral }}>No tasks match your filters</p>
          {hasFilters && (
            <button type="button" onClick={() => { setStatusFilter("All"); setPriorityFilter("All"); setTeamFilter("All"); setSearch(""); }}
              className="text-xs font-semibold px-4 py-2 rounded-xl text-white mt-1" style={{ background: C.accent }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ══ BOARD VIEW ══ */}
      {filtered.length > 0 && view === "board" && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {kanbanCols.map(col => {
            const isOver = dragOverCol === col.label;
            return (
              <div key={col.label}
                className="flex flex-col rounded-2xl min-h-0 transition-colors"
                style={{
                  background: isOver ? col.color + "08" : "#F8FAFC",
                  border: `1px solid ${isOver ? col.color + "60" : "#E4E9EF"}`,
                }}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col.label); }}
                onDragLeave={e => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node))
                    setDragOverCol(null);
                }}
                onDrop={e => handleDrop(e, col.label)}
              >
                {/* Column header */}
                <div className="flex items-center gap-2.5 px-4 py-3.5 border-b" style={{ borderColor: "#E4E9EF" }}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
                  <span className="text-sm font-bold flex-1" style={{ color: C.primary }}>{col.label}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: col.color + "20", color: col.color, minWidth: 26, textAlign: "center" }}>
                    {col.tasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-3 p-3 overflow-y-auto"
                     style={{ minHeight: 200, height: "calc(100vh - 260px)" }}>
                  {col.tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-xl border-2 border-dashed transition-colors"
                         style={{ borderColor: isOver ? col.color + "40" : "transparent" }}>
                      {isOver ? (
                        <p className="text-xs font-semibold" style={{ color: col.color }}>Drop here</p>
                      ) : (
                        <>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "40"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>
                          </svg>
                          <p className="text-xs" style={{ color: C.neutral + "66" }}>No tasks</p>
                        </>
                      )}
                    </div>
                  ) : col.tasks.map(t => {
                    const overdue   = isOverdue(t);
                    const isDragging = draggingId === t.taskId;
                    return (
                      <div key={t.taskId}
                        draggable
                        onDragStart={e => handleDragStart(e, t.taskId)}
                        onDragEnd={handleDragEnd}
                        className="transition-all"
                        style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" }}
                      >
                        <Link href={`/tasks/${t.taskId}`}
                          draggable={false}
                          className="block rounded-xl p-4 bg-white transition-all hover:shadow-md hover:-translate-y-0.5"
                          style={{ border: "1px solid #E8EDF2", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                          onClick={e => { if (isDragging) e.preventDefault(); }}
                        >
                          {/* Drag handle hint */}
                          <div className="flex items-start justify-between mb-2 gap-2">
                            <p className="text-sm font-semibold leading-snug flex-1" style={{ color: C.primary }}>{t.title}</p>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "55"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                              <circle cx="9" cy="5" r="1" fill={C.neutral + "55"}/><circle cx="15" cy="5" r="1" fill={C.neutral + "55"}/>
                              <circle cx="9" cy="12" r="1" fill={C.neutral + "55"}/><circle cx="15" cy="12" r="1" fill={C.neutral + "55"}/>
                              <circle cx="9" cy="19" r="1" fill={C.neutral + "55"}/><circle cx="15" cy="19" r="1" fill={C.neutral + "55"}/>
                            </svg>
                          </div>

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

                          <div className="flex items-center justify-between gap-2 mt-auto">
                            <PriorityBadge priority={t.priority} />
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {t.deadline && (
                                <div className="flex items-center gap-1">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                       stroke={overdue ? C.accent : C.neutral + "99"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                  </svg>
                                  <span className="text-xs font-medium" style={{ color: overdue ? C.accent : C.neutral }}>
                                    {new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </span>
                                </div>
                              )}
                              {t.assigneeId && (
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white"
                                     style={{ background: C.primary, fontSize: 10 }}
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
                  {/* Drop zone indicator at bottom when column has cards */}
                  {col.tasks.length > 0 && isOver && (
                    <div className="h-1.5 rounded-full mx-2 transition-all" style={{ background: col.color + "40" }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ LIST VIEW ══ */}
      {filtered.length > 0 && view === "list" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid text-xs font-semibold uppercase tracking-wider px-5 py-3"
               style={{
                 gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
                 color: C.neutral,
                 borderBottom: "1px solid #F1F5F9",
                 background: "#FAFBFC",
               }}>
            <span>Task</span><span>Status</span><span>Priority</span>
            <span>Assignee</span><span>Project</span><span>Deadline</span>
          </div>

          {filtered.map((t, i) => {
            const overdue = isOverdue(t);
            return (
              <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                className="grid items-center px-5 py-3.5 transition-colors hover:bg-gray-50"
                style={{
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr",
                  borderBottom: i < filtered.length - 1 ? "1px solid #F8FAFC" : "none",
                }}>
                <div className="min-w-0 pr-4">
                  <p className="text-sm font-semibold truncate" style={{ color: C.primary }}>{t.title}</p>
                  {teamMap[t.teamId] && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: C.neutral }}>{teamMap[t.teamId]}</p>
                  )}
                </div>
                <div><StatusBadge status={t.status} /></div>
                <div><PriorityBadge priority={t.priority} /></div>
                <div>
                  {t.assigneeId ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                           style={{ background: C.primary, fontSize: 10 }}>
                        {getUserName(t.assigneeId).charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm truncate" style={{ color: C.primary }}>{getUserName(t.assigneeId)}</span>
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: C.neutral + "66" }}>—</span>
                  )}
                </div>
                <div>
                  {projectMap[t.projectId] ? (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md"
                          style={{ background: C.blue + "12", color: C.blue }}>
                      {projectMap[t.projectId]}
                    </span>
                  ) : (
                    <span className="text-sm" style={{ color: C.neutral + "66" }}>—</span>
                  )}
                </div>
                <div>
                  {t.deadline ? (
                    <div className="flex items-center gap-1.5">
                      {overdue && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                      )}
                      <span className="text-sm font-medium" style={{ color: overdue ? C.accent : C.neutral }}>
                        {new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: C.neutral + "44" }}>No deadline</span>
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
