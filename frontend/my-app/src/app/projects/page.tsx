"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Project, Team, Task } from "@/types";
import { useProjectVisibility, scopeProjects } from "@/lib/hooks/useProjectVisibility";

const STATUS_CONFIG = {
  "To Do":       { dot: "#6b7280", bg: "rgba(107,114,128,0.10)", text: "#8a8f96" },
  "In Progress": { dot: "#3d6b9e", bg: "rgba(61,107,158,0.12)",  text: "#5a8ab8" },
  "In Review":   { dot: "#8a6a1e", bg: "rgba(138,106,30,0.14)",  text: "#a88340" },
  "Done":        { dot: "#2d6e52", bg: "rgba(45,110,82,0.14)",   text: "#4a9070" },
} as const;

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
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

// ── Filter dropdown ───────────────────────────────────────────────────────────
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
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg z-[100] overflow-y-auto"
             style={{ minWidth: 160, maxHeight: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
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

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-md"
           style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
          <button type="button" onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  if (total === 0) return <div className="h-1 rounded-full bg-surface-container-high w-full" />;
  const done = tasks.filter(t => normalizeStatus(t.status) === "Done").length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="h-1 rounded-full bg-surface-container-high w-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500"
           style={{ width: `${pct}%`, background: pct === 100 ? STATUS_CONFIG["Done"].dot : STATUS_CONFIG["In Progress"].dot }} />
    </div>
  );
}

// ── Task status breakdown ─────────────────────────────────────────────────────
function StatusBreakdown({ tasks }: { tasks: Task[] }) {
  const counts = Object.fromEntries(
    Object.keys(STATUS_CONFIG).map(s => [s, tasks.filter(t => normalizeStatus(t.status) === s).length])
  ) as Record<keyof typeof STATUS_CONFIG, number>;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {(Object.entries(counts) as [keyof typeof STATUS_CONFIG, number][]).map(([s, n]) => {
        if (n === 0) return null;
        const cfg = STATUS_CONFIG[s];
        return (
          <span key={s} className="flex items-center gap-1 text-[11px]" style={{ color: cfg.text }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
            {s} · {n}
          </span>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const canScope = user?.role === "manager" || user?.role === "admin";
  const currentUserSub = user?.userId;
  const { scope, setScope } = useProjectVisibility();

  const [projects,  setProjects]  = useState<Project[]>([]);
  const [teams,     setTeams]     = useState<Team[]>([]);
  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [teamFilter, setTeamFilter] = useState("All");

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [newTeamId,  setNewTeamId]  = useState("");
  const [creating,   setCreating]   = useState(false);
  const [createErr,  setCreateErr]  = useState("");

  // edit modal
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName,    setEditName]    = useState("");
  const [editDesc,    setEditDesc]    = useState("");
  const [saving,      setSaving]      = useState(false);
  const [editErr,     setEditErr]     = useState("");

  // delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get("/projects").then(r => r.data as Project[]),
      api.get("/tasks").then(r => r.data as Task[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
    ]).then(([p, t, tm]) => {
      setProjects(p); setTasks(t); setTeams(tm);
    }).finally(() => setLoading(false));
  }, [user, isManager]);

  const teamMap = Object.fromEntries(teams.map(t => [t.teamId, t.name]));
  const teamOptions = ["All", ...teams.map(t => t.name)];

  const scopedProjects = canScope ? scopeProjects(projects, scope, currentUserSub) : projects;
  const filtered = scopedProjects.filter(p => {
    if (teamFilter !== "All" && teamMap[p.teamId] !== teamFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const hasFilters = teamFilter !== "All" || !!search || (canScope && scope === "mine");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setCreateErr("");
    if (!newName.trim()) { setCreateErr("Project name is required."); return; }
    if (!newTeamId)      { setCreateErr("Team is required."); return; }
    setCreating(true);
    try {
      const { data } = await api.post("/projects", {
        name: newName.trim(), description: newDesc.trim(), teamId: newTeamId,
      });
      setProjects(prev => [data, ...prev]);
      setShowCreate(false); setNewName(""); setNewDesc(""); setNewTeamId("");
    } catch (err: unknown) {
      setCreateErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create project.");
    } finally { setCreating(false); }
  }

  function openEdit(p: Project) {
    setEditProject(p); setEditName(p.name); setEditDesc(p.description ?? ""); setEditErr("");
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault(); setEditErr("");
    if (!editName.trim()) { setEditErr("Project name is required."); return; }
    if (!editProject) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/projects/${editProject.projectId}`, {
        name: editName.trim(), description: editDesc.trim(),
      });
      setProjects(prev => prev.map(p => p.projectId === editProject.projectId ? data : p));
      setEditProject(null);
    } catch (err: unknown) {
      setEditErr((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to update project.");
    } finally { setSaving(false); }
  }

  async function handleDelete(projectId: string) {
    setDeletingId(projectId);
    try {
      await api.delete(`/projects/${projectId}`);
      setProjects(prev => prev.filter(p => p.projectId !== projectId));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
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

  return (
    <ProtectedLayout>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Projects</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {filtered.length}{projects.length !== filtered.length ? ` of ${projects.length}` : ""} project{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isManager && (
          <button type="button" onClick={() => { setShowCreate(true); setCreateErr(""); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Project
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
               viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 focus:border-outline focus:ring-0 focus:outline-none transition-colors"
            style={{ width: 220 }} />
        </div>

        {canScope && (
          <div className="flex items-center rounded-lg border border-outline-variant overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <button
              type="button"
              onClick={() => setScope("all")}
              className="px-3 py-2 text-sm transition-colors"
              style={{
                background: scope === "all" ? "rgba(255,255,255,0.06)" : "transparent",
                color: scope === "all" ? "#e5e2e1" : "#8e9192",
                fontWeight: scope === "all" ? 500 : 400,
                borderRight: "1px solid #444748",
              }}>
              All projects
            </button>
            <button
              type="button"
              onClick={() => setScope("mine")}
              className="px-3 py-2 text-sm transition-colors"
              style={{
                background: scope === "mine" ? "rgba(255,255,255,0.06)" : "transparent",
                color: scope === "mine" ? "#e5e2e1" : "#8e9192",
                fontWeight: scope === "mine" ? 500 : 400,
              }}>
              Created by me
            </button>
          </div>
        )}

        {teams.length > 0 && (
          <FilterDropdown options={teamOptions} value={teamFilter} onChange={setTeamFilter} label="Team" />
        )}

        {hasFilters && (
          <button type="button" onClick={() => { setTeamFilter("All"); setSearch(""); if (canScope) setScope("all"); }}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">
              {hasFilters ? "No projects match your filters" : "No projects yet"}
            </p>
            {hasFilters
              ? <p className="text-xs text-on-surface-variant mt-1">Try adjusting or clearing your filters.</p>
              : isManager && <p className="text-xs text-on-surface-variant mt-1">Create your first project to get started.</p>
            }
          </div>
          {hasFilters ? (
            <button type="button" onClick={() => { setTeamFilter("All"); setSearch(""); if (canScope) setScope("all"); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
              Clear filters
            </button>
          ) : isManager && (
            <button type="button" onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
              New Project
            </button>
          )}
        </div>
      )}

      {/* Project grid */}
      {filtered.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {filtered.map(p => {
            const projectTasks = tasks.filter(t => t.projectId === p.projectId);
            const total = projectTasks.length;
            const done  = projectTasks.filter(t => normalizeStatus(t.status) === "Done").length;
            const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
            const isDeleting = deletingId === p.projectId;

            return (
              <Link key={p.projectId} href={`/board?project=${p.projectId}`}
                className="group bg-surface-container rounded-xl border border-outline-variant hover:border-outline transition-colors flex flex-col"
                style={{ opacity: isDeleting ? 0.5 : 1 }}>

                {/* Card header */}
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-outline-variant/60">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center flex-shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                        </svg>
                      </div>
                      <h2 className="text-sm font-semibold text-on-surface truncate">{p.name}</h2>
                    </div>
                    {p.description && (
                      <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2 ml-9">{p.description}</p>
                    )}
                  </div>
                  {isManager && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button type="button" onClick={e => { e.preventDefault(); openEdit(p); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button type="button" onClick={e => { e.preventDefault(); handleDelete(p.projectId); }} disabled={isDeleting}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-colors disabled:opacity-40">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="px-5 py-4 space-y-3 flex-1">
                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-on-surface-variant">Progress</span>
                      <span className="font-semibold" style={{ color: pct === 100 ? STATUS_CONFIG["Done"].text : "#e5e2e1" }}>
                        {total === 0 ? "No tasks" : `${done}/${total} done · ${pct}%`}
                      </span>
                    </div>
                    <ProgressBar tasks={projectTasks} />
                  </div>

                  {/* Status breakdown */}
                  {total > 0 && <StatusBreakdown tasks={projectTasks} />}

                  {/* Meta */}
                  <div className="flex items-center justify-between pt-1">
                    {teamMap[p.teamId] && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/60 text-on-surface-variant">
                        {teamMap[p.teamId]}
                      </span>
                    )}
                    <span className="text-[11px] text-on-surface-variant/60 ml-auto">
                      Updated {timeAgo(p.updatedAt ?? p.createdAt)}
                    </span>
                  </div>
                </div>

              </Link>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="New Project" onClose={() => { setShowCreate(false); setNewName(""); setNewDesc(""); setNewTeamId(""); setCreateErr(""); }}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                Name <span className="text-error normal-case tracking-normal font-normal ml-1">*</span>
              </label>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Auth Overhaul"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Description</label>
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3}
                placeholder="What is this project about?"
                className="w-full px-3.5 py-3 rounded-lg text-sm bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                Team <span className="text-error normal-case tracking-normal font-normal ml-1">*</span>
              </label>
              <select value={newTeamId} onChange={e => setNewTeamId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-surface-container border border-outline-variant text-on-surface focus:border-outline focus:ring-0 focus:outline-none transition-colors appearance-none">
                <option value="" disabled>Select a team</option>
                {teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
              </select>
            </div>
            {createErr && (
              <p className="text-xs text-error flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {createErr}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={creating}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {creating && <div className="w-3.5 h-3.5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />}
                {creating ? "Creating…" : "Create Project"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editProject && (
        <Modal title="Edit Project" onClose={() => setEditProject(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                Name <span className="text-error normal-case tracking-normal font-normal ml-1">*</span>
              </label>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Description</label>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                className="w-full px-3.5 py-3 rounded-lg text-sm bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors resize-none" />
            </div>
            {editErr && (
              <p className="text-xs text-error flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {editErr}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditProject(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      )}

    </ProtectedLayout>
  );
}
