"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Task, Comment, User, Project, Team, ActivityLog } from "@/types";

const C = { primary: "#232F3E", accent: "#FF9900", blue: "#0073BB", neutral: "#64748B" };

const STATUS_OPTIONS = ["To Do", "In Progress", "In Review", "Done"];
const STATUS_COLOR: Record<string, string> = {
  "To Do": C.neutral, "In Progress": C.blue, "In Review": C.accent, "Done": "#10B981",
};
const PRIORITY_COLOR: Record<string, string> = {
  Critical: "#EF4444", High: C.accent, Medium: C.blue, Low: C.neutral,
};
const AVATAR_COLORS = ["#6366F1", "#EC4899", "#10B981", "#F59E0B", "#3B82F6", "#8B5CF6", "#EF4444", C.blue];

function normalizeStatus(s: string) {
  if (s === "Todo") return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview") return "In Review";
  return s;
}

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " + new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Avatar({ name, userId, size = 32 }: { name: string; userId: string; size?: number }) {
  const bg = avatarColor(userId);
  const ini = initials(name || "?");
  const fontSize = size < 28 ? 10 : size < 36 ? 12 : 14;
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
         style={{ width: size, height: size, background: bg, fontSize }}>
      {ini}
    </div>
  );
}

function StatusDropdown({ status, onChange, disabled }: {
  status: string; onChange: (s: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = normalizeStatus(status);
  const color = STATUS_COLOR[label] ?? C.neutral;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold w-full"
        style={{ background: color + "18", color, border: `1.5px solid ${color}30` }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="flex-1 text-left">{label}</span>
        {!disabled && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
               strokeLinecap="round" strokeLinejoin="round"
               style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl z-50 overflow-hidden"
             style={{ border: "1px solid #E2E8F0", minWidth: 160 }}>
          {STATUS_OPTIONS.map(s => {
            const c = STATUS_COLOR[s] ?? C.neutral;
            return (
              <button key={s} type="button"
                onClick={() => { onChange(s); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                style={{ color: s === label ? c : C.primary, fontWeight: s === label ? 600 : 400 }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
                {s}
                {s === label && (
                  <svg className="ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none"
                       stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TaskDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const { user } = useAuth();
  const taskId   = params.id as string;

  const [task,        setTask]        = useState<Task | null>(null);
  const [comments,    setComments]    = useState<Comment[]>([]);
  const [activity,    setActivity]    = useState<ActivityLog[]>([]);
  const [users,       setUsers]       = useState<User[]>([]);
  const [projects,    setProjects]    = useState<Project[]>([]);
  const [teams,       setTeams]       = useState<Team[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [statusSaving,setStatusSaving]= useState(false);
  const [imageUrl,    setImageUrl]    = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [confirmDel,  setConfirmDel]  = useState(false);

  useEffect(() => {
    if (!user) return;
    const isManager = user.role === "manager";
    Promise.all([
      api.get(`/tasks/${taskId}`).then(r => r.data as Task),
      api.get(`/tasks/${taskId}/comments`).then(r => r.data as Comment[]).catch(() => []),
      api.get(`/tasks/${taskId}/activity`).then(r => r.data as ActivityLog[]).catch(() => []),
      api.get("/projects").then(r => r.data as Project[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
    ]).then(([t, c, a, p, tm, u]) => {
      setTask({ ...t, status: normalizeStatus(t.status) as Task["status"] });
      setComments(c); setActivity(a); setProjects(p); setTeams(tm); setUsers(u);
      if (t.imageKey) {
        api.get(`/tasks/${taskId}/image`).then(r => setImageUrl(r.data?.url ?? null)).catch(() => null);
      }
    }).catch(() => setError("Failed to load task."))
      .finally(() => setLoading(false));
  }, [taskId, user]);

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    const prev = task.status;
    setTask(t => t ? { ...t, status: newStatus as Task["status"] } : t);
    setStatusSaving(true);
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
    } catch {
      setTask(t => t ? { ...t, status: prev } : t);
    } finally {
      setStatusSaving(false);
    }
  };

  const handleComment = async () => {
    if (!commentBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/tasks/${taskId}/comments`, { body: commentBody });
      setComments(prev => [...prev, res.data]);
      setCommentBody("");
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/tasks/${taskId}`);
      router.push("/tasks");
    } catch { setDeleting(false); setConfirmDel(false); }
  };

  const getUserById = (id: string) => users.find(u => u.userId === id);
  const displayName = (id: string) => {
    const u = getUserById(id);
    return u?.name || u?.email?.split("@")[0] || id.slice(0, 8);
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

  if (error || !task) {
    return (
      <ProtectedLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-sm font-semibold" style={{ color: C.neutral }}>{error || "Task not found."}</p>
          <Link href="/tasks" className="text-sm font-semibold hover:underline" style={{ color: C.blue }}>← Back to Tasks</Link>
        </div>
      </ProtectedLayout>
    );
  }

  const status        = normalizeStatus(task.status);
  const statusColor   = STATUS_COLOR[status] ?? C.neutral;
  const priorityColor = PRIORITY_COLOR[task.priority] ?? C.neutral;
  const projectName   = task.projectId ? projects.find(p => p.projectId === task.projectId)?.name : null;
  const teamObj       = task.teamId    ? teams.find(t => t.teamId    === task.teamId)          : null;
  const assigneeUser  = task.assigneeId ? getUserById(task.assigneeId) : null;
  const isOverdue     = task.deadline && status !== "Done" && new Date(task.deadline) < new Date();
  const isManager     = user?.role === "manager";

  return (
    <ProtectedLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 text-sm" style={{ color: C.neutral }}>
        <Link href="/tasks" className="hover:underline font-medium flex items-center gap-1.5" style={{ color: C.blue }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Tasks
        </Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className="font-medium truncate" style={{ color: C.primary }}>{task.title}</span>
      </div>

      <div className="grid grid-cols-3 gap-6 items-start">

        {/* ── Left / main column ── */}
        <div className="col-span-2 space-y-5">

          {/* Task header */}
          <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: "1px solid #E4E9F0" }}>
            {/* ID + title */}
            <div className="flex items-start gap-3 mb-4">
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg flex-shrink-0 mt-0.5"
                    style={{ background: C.primary + "0E", color: C.neutral, border: "1px solid #E4E9F0" }}>
                #{task.taskId.slice(0, 8).toUpperCase()}
              </span>
              <h1 className="text-xl font-bold leading-snug flex-1" style={{ color: C.primary }}>{task.title}</h1>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: priorityColor + "15", color: priorityColor, border: `1px solid ${priorityColor}25` }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColor }} />
                {task.priority}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: statusColor + "15", color: statusColor, border: `1px solid ${statusColor}25` }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                {status}
              </span>
              {isOverdue && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A525" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  Overdue
                </span>
              )}
              {projectName && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: C.blue + "12", color: C.blue, border: `1px solid ${C.blue}20` }}>
                  {projectName}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="mb-1">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.neutral }}>Description</p>
              {task.description ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#374151" }}>{task.description}</p>
              ) : (
                <p className="text-sm italic" style={{ color: C.neutral + "66" }}>No description provided.</p>
              )}
            </div>
          </div>

          {/* Attachments */}
          <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: "1px solid #E4E9F0" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: C.primary }}>
                Attachments
                {imageUrl && <span className="ml-2 text-xs font-normal" style={{ color: C.neutral }}>(1)</span>}
              </h2>
              {isManager && (
                <button type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-80"
                  style={{ background: C.accent + "15", color: C.accent, border: `1px solid ${C.accent}25` }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add File
                </button>
              )}
            </div>

            {imageUrl ? (
              <div className="flex flex-wrap gap-3">
                <a href={imageUrl} target="_blank" rel="noopener noreferrer"
                   className="group relative block rounded-xl overflow-hidden"
                   style={{ border: "1.5px solid #E4E9F0", width: 120, height: 96 }}>
                  <img src={imageUrl} alt="Attachment" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                       style={{ background: "rgba(0,0,0,0.3)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  </div>
                </a>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 rounded-xl gap-2"
                   style={{ border: "1.5px dashed #E2E8F0", background: "#FAFBFC" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "66"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                </svg>
                <p className="text-xs" style={{ color: C.neutral }}>No attachments yet</p>
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: "1px solid #E4E9F0" }}>
            <h2 className="text-sm font-bold mb-5" style={{ color: C.primary }}>
              Comments
              {comments.length > 0 && (
                <span className="ml-2 text-xs font-normal" style={{ color: C.neutral }}>({comments.length})</span>
              )}
            </h2>

            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 gap-2 mb-5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "44"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                <p className="text-sm" style={{ color: C.neutral }}>No comments yet.</p>
              </div>
            ) : (
              <div className="space-y-4 mb-5">
                {comments.map(c => {
                  const name = displayName(c.authorId);
                  return (
                    <div key={c.commentId} className="flex gap-3">
                      <Avatar name={name} userId={c.authorId} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-semibold" style={{ color: C.primary }}>{name}</span>
                          <span className="text-xs" style={{ color: C.neutral + "88" }}>{timeAgo(c.createdAt)}</span>
                        </div>
                        <div className="rounded-xl px-4 py-3 text-sm leading-relaxed"
                             style={{ background: "#F8FAFC", border: "1px solid #E8ECF0", color: "#374151" }}>
                          {c.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Comment input */}
            <div className="flex gap-3">
              {user && (
                <Avatar name={user.name || user.email || "?"} userId={user.userId} size={32} />
              )}
              <div className="flex-1">
                <textarea
                  value={commentBody}
                  onChange={e => setCommentBody(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleComment(); }}
                  placeholder="Add a comment… (Ctrl+Enter to submit)"
                  rows={3}
                  className="w-full px-4 py-3 text-sm rounded-xl resize-none outline-none transition-all"
                  style={{
                    border: `1.5px solid ${commentBody ? C.accent : "#E2E8F0"}`,
                    color: C.primary,
                    background: "white",
                  }} />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs flex items-center gap-1" style={{ color: C.neutral + "88" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                    </svg>
                    Ctrl+Enter to submit
                  </span>
                  <button type="button" onClick={handleComment}
                    disabled={!commentBody.trim() || submitting}
                    className="px-4 py-1.5 text-sm font-semibold rounded-lg text-white transition-opacity disabled:opacity-40"
                    style={{ background: C.accent }}>
                    {submitting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-4">

          {/* Status */}
          <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: "1px solid #E4E9F0" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.neutral }}>Status</p>
            <StatusDropdown status={task.status} onChange={handleStatusChange} disabled={statusSaving} />
          </div>

          {/* Details */}
          <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: "1px solid #E4E9F0" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: C.neutral }}>Details</p>
            <div className="space-y-3.5">

              {/* Priority */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium flex-shrink-0" style={{ color: C.neutral }}>Priority</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: priorityColor + "15", color: priorityColor, border: `1px solid ${priorityColor}20` }}>
                  {task.priority}
                </span>
              </div>

              {/* Deadline */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium flex-shrink-0" style={{ color: C.neutral }}>Deadline</span>
                {task.deadline ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold"
                        style={{ color: isOverdue ? "#EF4444" : C.primary }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {formatDate(task.deadline)}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: C.neutral + "66" }}>None</span>
                )}
              </div>

              {/* Team */}
              {teamObj && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium flex-shrink-0" style={{ color: C.neutral }}>Team</span>
                  <span className="text-xs font-semibold" style={{ color: C.primary }}>{teamObj.name}</span>
                </div>
              )}

              {/* Assignee */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium flex-shrink-0" style={{ color: C.neutral }}>Assignee</span>
                {assigneeUser ? (
                  <div className="flex items-center gap-2">
                    <Avatar name={assigneeUser.name || assigneeUser.email || "?"} userId={assigneeUser.userId} size={24} />
                    <span className="text-xs font-semibold" style={{ color: C.primary }}>
                      {assigneeUser.name || assigneeUser.email?.split("@")[0]}
                    </span>
                  </div>
                ) : task.assigneeId ? (
                  <div className="flex items-center gap-2">
                    <Avatar name={task.assigneeId} userId={task.assigneeId} size={24} />
                    <span className="text-xs font-semibold" style={{ color: C.primary }}>{displayName(task.assigneeId)}</span>
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: C.neutral + "66" }}>Unassigned</span>
                )}
              </div>

              {/* Created */}
              <div className="flex items-center justify-between gap-2 pt-2.5 mt-1"
                   style={{ borderTop: "1px solid #F1F5F9" }}>
                <span className="text-xs font-medium flex-shrink-0" style={{ color: C.neutral }}>Created</span>
                <span className="text-xs" style={{ color: C.neutral }}>{formatDate(task.createdAt)}</span>
              </div>

            </div>
          </div>

          {/* History */}
          {activity.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5" style={{ border: "1px solid #E4E9F0" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: C.neutral }}>History</p>
              <div className="space-y-3">
                {activity.slice(0, 8).map((a, i) => {
                  const toStatus   = (a as unknown as Record<string, string>).toStatus;
                  const fromStatus = (a as unknown as Record<string, string>).fromStatus;
                  const changedBy  = (a as unknown as Record<string, string>).changedBy;
                  const changedAt  = (a as unknown as Record<string, string>).changedAt ?? a.createdAt;
                  const sc         = STATUS_COLOR[normalizeStatus(toStatus)] ?? C.neutral;

                  return (
                    <div key={a.logId ?? i} className="flex gap-2.5">
                      <div className="w-1.5 flex-shrink-0 flex flex-col items-center pt-1">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc }} />
                        {i < activity.slice(0, 8).length - 1 && (
                          <div className="w-px flex-1 mt-1" style={{ background: "#E8ECF0" }} />
                        )}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <p className="text-xs leading-snug" style={{ color: C.primary }}>
                          Moved to{" "}
                          <span className="font-semibold" style={{ color: sc }}>
                            {normalizeStatus(toStatus)}
                          </span>
                          {fromStatus && (
                            <span style={{ color: C.neutral }}> from {normalizeStatus(fromStatus)}</span>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs" style={{ color: C.neutral + "88" }}>
                            {changedAt ? formatDateTime(changedAt) : ""}
                          </p>
                          {changedBy && (
                            <>
                              <span style={{ color: C.neutral + "44" }}>·</span>
                              <p className="text-xs font-medium truncate" style={{ color: C.neutral }}>
                                {displayName(changedBy)}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manager actions */}
          {isManager && (
            <div className="space-y-2">
              <Link href={`/tasks/new?edit=${taskId}`}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-white transition-colors hover:bg-gray-50"
                style={{ color: C.primary, border: "1.5px solid #E2E8F0" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Task
              </Link>

              {confirmDel ? (
                <div className="rounded-xl p-4 space-y-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                  <p className="text-xs font-semibold" style={{ color: "#DC2626" }}>Delete this task? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmDel(false)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-gray-50 transition-colors"
                      style={{ border: "1px solid #E2E8F0", color: C.neutral }}>
                      Cancel
                    </button>
                    <button type="button" onClick={handleDelete} disabled={deleting}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-60"
                      style={{ background: "#DC2626" }}>
                      {deleting ? "Deleting…" : "Confirm Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDel(true)}
                  className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-red-50"
                  style={{ color: "#DC2626", border: "1.5px solid #FECACA", background: "#FEF2F2" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6"/><path d="M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                  </svg>
                  Delete Task
                </button>
              )}
            </div>
          )}

          {/* Activity Feed */}
          {activity.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: "1px solid #E4E9F0" }}>
              <h2 className="text-sm font-bold mb-5" style={{ color: C.primary }}>
                Recent Activity
                <span className="ml-2 text-xs font-normal" style={{ color: C.neutral }}>({activity.length})</span>
              </h2>
              <div className="space-y-4">
                {activity.slice().reverse().map((log, idx) => {
                  const actor = displayName(log.userId || "");
                  const timestamp = formatDateTime(log.createdAt);
                  let message = "";
                  let icon = null;
                  
                  if (log.type === "TASK_CREATED") {
                    message = "Task created";
                    icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14"/></svg>;
                  } else if (log.type === "STATUS_CHANGED") {
                    message = `Status changed to ${(log.payload?.toStatus as string | undefined) || "unknown"}`;
                    icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
                  } else if (log.type === "TASK_ASSIGNED") {
                    message = `Assigned to ${displayName((log.payload?.assigneeId as string | undefined) || "")}`;
                    icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
                  } else if (log.type === "COMMENT_ADDED") {
                    message = "Comment added";
                    icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
                  } else {
                    message = log.type || "Activity recorded";
                    icon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/></svg>;
                  }

                  return (
                    <div key={idx} className="flex gap-3 pb-3" style={{ borderBottom: "1px solid #E8ECF0" }}>
                      <div className="flex-shrink-0 pt-1" style={{ color: C.accent }}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: C.primary }}>
                          {actor}
                          <span className="font-normal" style={{ color: C.neutral + "99" }}> {message}</span>
                        </p>
                        <p className="text-xs" style={{ color: C.neutral }}>{timestamp}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </ProtectedLayout>
  );
}
