"use client";

import { useEffect, useRef, useState } from "react";
import SlideOver from "@/components/ui/SlideOver";
import Dropdown from "@/components/ui/Dropdown";
import DatePicker from "@/components/ui/DatePicker";
import { useToast } from "@/components/ui/Toast";
import ActivityFeed from "@/components/ActivityFeed";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { fetchTaskImageUrls } from "@/lib/taskImage";
import type { Task, Comment, User, Project, Team } from "@/types";

const STATUS_CONFIG = {
  "To Do":       { dot: "#6b7280", bg: "rgba(107,114,128,0.10)", text: "#8a8f96" },
  "In Progress": { dot: "#3d6b9e", bg: "rgba(61,107,158,0.12)",  text: "#5a8ab8" },
  "In Review":   { dot: "#8a6a1e", bg: "rgba(138,106,30,0.14)",  text: "#a88340" },
  "Done":        { dot: "#2d6e52", bg: "rgba(45,110,82,0.14)",   text: "#4a9070" },
} as const;

const PRIORITY_CONFIG = {
  Low:      { dot: "#6b7280", text: "#9ca3af" },
  Medium:   { dot: "#7a6520", text: "#9e8438" },
  High:     { dot: "#7a4a25", text: "#9e6840" },
  Critical: { dot: "#8b3535", text: "#b05555" },
} as const;

const STATUS_OPTIONS = ["To Do", "In Progress", "In Review", "Done"] as const;

function normalizeStatus(s: string) {
  if (s === "Todo") return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview") return "In Review";
  return s;
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const ini = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full flex items-center justify-center font-semibold bg-surface-container-highest border border-outline-variant text-on-surface flex-shrink-0"
         style={{ width: size, height: size, fontSize: size < 28 ? 10 : size < 36 ? 12 : 13 }}>
      {ini}
    </div>
  );
}

// ── Status dropdown ───────────────────────────────────────────────────────────
function StatusDropdown({ status, onChange, disabled }: {
  status: string; onChange: (s: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = normalizeStatus(status);
  const cfg = STATUS_CONFIG[label as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG["To Do"];

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
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium w-full transition-colors"
        style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.dot}30` }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
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
        <div className="absolute left-0 top-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg z-50 overflow-hidden w-full"
             style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {STATUS_OPTIONS.map(s => {
            const c = STATUS_CONFIG[s];
            return (
              <button key={s} type="button"
                onClick={() => { onChange(s); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-surface-container-high transition-colors flex items-center gap-2.5"
                style={{ color: s === label ? c.text : "#e5e2e1", fontWeight: s === label ? 600 : 500 }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.dot }} />
                {s}
                {s === label && (
                  <svg className="ml-auto" width="12" height="12" viewBox="0 0 24 24" fill="none"
                       stroke={c.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

// ── Detail row ────────────────────────────────────────────────────────────────
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-outline-variant/50 last:border-0">
      <span className="text-xs text-on-surface-variant flex-shrink-0 pt-0.5">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

// ── Field label ───────────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
      {children}{required && <span className="ml-1 text-error normal-case tracking-normal font-normal">*</span>}
    </label>
  );
}

// ── Task form (create + edit) ───────────────────────────────────────────────────
function TaskForm({ taskId, onSaved, onCancel }: {
  taskId: string | null; onSaved: () => void; onCancel: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const isEdit = !!taskId;

  const [teams,    setTeams]    = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState("");

  const [title,       setTitle]       = useState("");
  const [priority,    setPriority]    = useState("");
  const [deadline,    setDeadline]    = useState("");
  const [description, setDescription] = useState("");
  const [teamId,      setTeamId]      = useState("");
  const [assigneeId,  setAssigneeId]  = useState("");
  const [projectId,   setProjectId]   = useState("");
  const [file,        setFile]        = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [dragOver,    setDragOver]    = useState(false);
  const [didPrefill,  setDidPrefill]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file || !file.type.startsWith("image/")) { setFilePreview(null); return; }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const teamUsers    = users.filter(u => !teamId || u.teamId === teamId);
  const teamProjects = projects.filter(p => !teamId || p.teamId === teamId);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get("/teams").then(r => r.data as Team[]),
      api.get("/users").then(r => r.data as User[]),
      api.get("/projects").then(r => r.data as Project[]),
      isEdit ? api.get(`/tasks/${taskId}`).then(r => r.data as Task) : Promise.resolve(null),
    ]).then(([t, u, p, task]) => {
      setTeams(t); setUsers(u); setProjects(p);
      if (task) {
        setTitle(task.title ?? "");
        setDescription(task.description ?? "");
        setPriority(task.priority ?? "");
        setDeadline(task.deadline ? task.deadline.split("T")[0] : "");
        setTeamId(task.teamId ?? "");
        setProjectId(task.projectId ?? "");
        setAssigneeId(task.assigneeId ?? "");
        setDidPrefill(true);
      }
    }).finally(() => setLoading(false));
  }, [user, isEdit, taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!didPrefill && !isEdit) { setAssigneeId(""); setProjectId(""); return; }
    if (didPrefill) { setDidPrefill(false); return; }
    setAssigneeId(""); setProjectId("");
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFile(f: File) {
    const ok = ["image/svg+xml","image/png","image/jpeg","application/pdf"];
    if (!ok.includes(f.type))      { setError("Only SVG, PNG, JPG or PDF allowed."); toast("Only SVG, PNG, JPG or PDF allowed."); return; }
    if (f.size > 10 * 1024 * 1024) { setError("File must be under 10 MB."); toast("File must be under 10 MB."); return; }
    setError(""); setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!title.trim()) { setError("Task title is required."); return; }
    if (!priority)     { setError("Priority is required."); return; }
    if (!deadline)     { setError("Deadline is required."); return; }
    if (!teamId)       { setError("Target team is required."); return; }
    if (!assigneeId)   { setError("Assignee is required."); return; }
    if (!projectId)    { setError("Project is required."); return; }
    setSubmitting(true);
    try {
      let savedId: string;
      if (isEdit) {
        await api.put(`/tasks/${taskId}`, {
          title: title.trim(), description: description.trim(),
          priority, deadline, teamId, assigneeId,
        });
        savedId = taskId!;
      } else {
        const { data: created } = await api.post("/tasks", {
          title: title.trim(), description: description.trim(),
          priority, deadline, teamId, assigneeId, projectId,
        });
        savedId = created.taskId;
      }
      if (file) {
        const { data: { uploadUrl } } = await api.post(`/tasks/${savedId}/image`, {
          filename: file.name, contentType: file.type,
        });
        await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      }
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (isEdit ? "Failed to update task." : "Failed to create task.");
      setError(msg); toast(msg);
    } finally { setSubmitting(false); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
      </div>
    );
  }

  const priorityOptions = Object.entries(PRIORITY_CONFIG).map(([v, c]) => ({ value: v, label: v, dot: c.dot }));
  const teamOptions     = teams.map(t => ({ value: t.teamId, label: t.name }));
  const projectOptions  = teamProjects.map(p => ({ value: p.projectId, label: p.name }));
  const assigneeOptions = teamUsers.map(u => ({ value: u.userId, label: u.name || u.email.split("@")[0], sub: u.email }));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <div>
        <Label required>Title</Label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Implement S3 image pipeline"
          className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors"
        />
      </div>

      {/* Description */}
      <div>
        <Label>Description</Label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          rows={4} placeholder="Provide detailed steps, expected outcomes, or technical constraints…"
          className="w-full px-3.5 py-3 rounded-lg text-sm bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors resize-none"
        />
      </div>

      {/* Priority + Deadline */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label required>Priority</Label>
          <Dropdown value={priority} onChange={setPriority} placeholder="Select priority" options={priorityOptions} />
        </div>
        <div>
          <Label required>Deadline</Label>
          <DatePicker value={deadline} onChange={setDeadline} min={new Date().toISOString().split("T")[0]} />
        </div>
      </div>

      {/* Team + Project */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label required>Team</Label>
          <Dropdown value={teamId} onChange={setTeamId} placeholder="Select team" options={teamOptions} />
        </div>
        <div>
          <Label required>Project</Label>
          <Dropdown value={projectId} onChange={setProjectId}
            placeholder={teamId ? "Select project" : "Select team first"}
            options={projectOptions} disabled={!teamId || isEdit} />
          {isEdit && <p className="text-[10px] text-on-surface-variant/60 mt-1.5">Project cannot be changed after creation.</p>}
        </div>
      </div>

      {/* Assignee */}
      <div>
        <Label required>Assignee</Label>
        <Dropdown value={assigneeId} onChange={setAssigneeId}
          placeholder={teamId ? "Select assignee" : "Select team first"}
          options={assigneeOptions} disabled={!teamId} />
      </div>

      {/* Attachment */}
      <div>
        <Label>Attachment</Label>
        {file ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface border border-outline-variant">
            {filePreview ? (
              <img src={filePreview} alt={file.name}
                   className="w-12 h-12 rounded-lg object-cover border border-outline-variant flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center flex-shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-on-surface truncate">{file.name}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button type="button" onClick={() => setFile(null)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors flex-shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 py-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
            style={{ borderColor: dragOver ? "#8e9192" : "#444748", background: dragOver ? "rgba(255,255,255,0.02)" : "transparent" }}>
            <div className="w-11 h-11 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-on-surface">Click to upload or drag and drop</p>
              <p className="text-xs text-on-surface-variant mt-0.5">SVG, PNG, JPG or PDF — max 10 MB</p>
            </div>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".svg,.png,.jpg,.jpeg,.pdf" className="hidden"
               onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg text-sm text-error"
             style={{ background: "rgba(255,180,171,0.08)", border: "1px solid rgba(255,180,171,0.2)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 rounded-lg text-sm font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-50">
          {submitting ? (
            <><div className="w-4 h-4 border-2 border-surface-container-lowest border-t-transparent rounded-full animate-spin" />{isEdit ? "Saving…" : "Creating…"}</>
          ) : isEdit ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Save Changes
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Task
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ── Detail view ─────────────────────────────────────────────────────────────────
function TaskView({ taskId, onChanged, onClose, onEdit }: {
  taskId: string; onChanged: () => void; onClose: () => void; onEdit: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [task,         setTask]        = useState<Task | null>(null);
  const [comments,     setComments]    = useState<Comment[]>([]);
  const [users,        setUsers]       = useState<User[]>([]);
  const [projects,     setProjects]    = useState<Project[]>([]);
  const [teams,        setTeams]       = useState<Team[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [pageError,    setPageError]   = useState("");
  const [commentBody,  setCommentBody] = useState("");
  const [submitting,   setSubmitting]  = useState(false);
  const [statusSaving, setStatusSaving]= useState(false);
  const [imageUrl,     setImageUrl]    = useState<string | null>(null);
  const [deleting,     setDeleting]    = useState(false);
  const [confirmDel,   setConfirmDel]  = useState(false);
  const [uploading,    setUploading]   = useState(false);
  const [uploadError,  setUploadError] = useState("");
  const [dragOver,     setDragOver]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(f: File) {
    setUploadError("");
    const ok = ["image/svg+xml", "image/png", "image/jpeg", "application/pdf"];
    if (!ok.includes(f.type))       { setUploadError("Only SVG, PNG, JPG or PDF allowed."); return; }
    if (f.size > 10 * 1024 * 1024)  { setUploadError("File must be under 10 MB."); return; }
    setUploading(true);
    try {
      const { data: { uploadUrl } } = await api.post(`/tasks/${taskId}/image`, {
        filename: f.name, contentType: f.type,
      });
      await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
      // optimistic local preview — instant, no reload
      const localUrl = URL.createObjectURL(f);
      setImageUrl(localUrl);
      setTask((t) => (t ? ({ ...t, imageKey: "pending" } as Task) : t));
      // reconcile with the server: original is available now; thumbnail upgrades later
      const { original, thumbnail } = await fetchTaskImageUrls(taskId);
      if (original || thumbnail) {
        URL.revokeObjectURL(localUrl);
        setImageUrl(thumbnail || original);
      }
      onChanged();
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally { setUploading(false); }
  }

  async function handleRemoveAttachment() {
    if (!confirm("Remove this attachment?")) return;
    try {
      await api.delete(`/tasks/${taskId}/image`);
      setImageUrl(null);
      setTask(t => t ? { ...t, imageKey: undefined, thumbnailKey: undefined } as Task : t);
      onChanged();
    } catch { setUploadError("Failed to remove attachment."); }
  }

  useEffect(() => {
    if (!user) return;
    const isManager = user.role === "manager";
    Promise.all([
      api.get(`/tasks/${taskId}`).then(r => r.data as Task),
      api.get(`/tasks/${taskId}/comments`).then(r => r.data as Comment[]).catch(() => []),
      api.get("/projects").then(r => r.data as Project[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
    ]).then(([t, c, p, tm, u]) => {
      setTask({ ...t, status: normalizeStatus(t.status) as Task["status"] });
      setComments(c); setProjects(p); setTeams(tm); setUsers(u);
      if (t.imageKey) {
        fetchTaskImageUrls(taskId).then(({ original, thumbnail }) =>
          setImageUrl(thumbnail || original)
        );
      }
    }).catch(() => setPageError("Failed to load task."))
      .finally(() => setLoading(false));
  }, [taskId, user]);

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    const prev = task.status;
    setTask(t => t ? { ...t, status: newStatus as Task["status"] } : t);
    setStatusSaving(true);
    try { await api.put(`/tasks/${taskId}`, { status: newStatus }); onChanged(); }
    catch { setTask(t => t ? { ...t, status: prev } : t); }
    finally { setStatusSaving(false); }
  };

  const handleComment = async () => {
    if (!commentBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/tasks/${taskId}/comments`, { body: commentBody });
      setComments(prev => [...prev, res.data]);
      setCommentBody("");
      onChanged();
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.delete(`/tasks/${taskId}`); onChanged(); onClose(); }
    catch { setDeleting(false); setConfirmDel(false); toast("Failed to delete task."); }
  };

  const getUserById  = (id: string) => users.find(u => u.userId === id);
  const displayName  = (id: string) => {
    const u = getUserById(id);
    return u?.name || u?.email?.split("@")[0] || id.slice(0, 8);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
      </div>
    );
  }

  if (pageError || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <p className="text-sm text-on-surface-variant">{pageError || "Task not found."}</p>
        <button type="button" onClick={onClose} className="text-sm text-on-surface hover:text-primary transition-colors">← Close</button>
      </div>
    );
  }

  const status        = normalizeStatus(task.status);
  const scfg          = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG["To Do"];
  const pcfg          = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG];
  const projectName   = projects.find(p => p.projectId === task.projectId)?.name;
  const teamObj       = teams.find(t => t.teamId === task.teamId);
  const assigneeUser  = task.assigneeId ? getUserById(task.assigneeId) : null;
  const isOverdue     = task.deadline && status !== "Done" && new Date(task.deadline) < new Date();
  const isManager     = user?.role === "manager";

  return (
    <div className="space-y-4">
      {/* Task ID + title */}
      <div className="flex items-start gap-3">
        <span className="text-[10px] font-mono font-semibold px-2 py-1 rounded bg-surface-container-high border border-outline-variant text-on-surface-variant flex-shrink-0 mt-0.5">
          #{task.taskId.slice(0, 8).toUpperCase()}
        </span>
        <h1 className="text-lg font-bold text-on-surface leading-snug flex-1">{task.title}</h1>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ background: scfg.bg, color: scfg.text, border: `1px solid ${scfg.dot}25` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: scfg.dot }} />
          {status}
        </span>
        {pcfg && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                style={{ background: pcfg.dot + "18", color: pcfg.text, border: `1px solid ${pcfg.dot}25` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: pcfg.dot }} />
            {task.priority}
          </span>
        )}
        {isOverdue && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-error"
                style={{ background: "rgba(255,180,171,0.1)", border: "1px solid rgba(255,180,171,0.2)" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Overdue
          </span>
        )}
        {projectName && (
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-container-high border border-outline-variant text-on-surface-variant">
            {projectName}
          </span>
        )}
      </div>

      {/* Status */}
      <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-3">Status</p>
        <StatusDropdown status={task.status} onChange={handleStatusChange} disabled={statusSaving} />
      </div>

      {/* Description */}
      <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Description</p>
        {task.description ? (
          <p className="text-sm leading-relaxed text-on-surface whitespace-pre-wrap">{task.description}</p>
        ) : (
          <p className="text-sm text-on-surface-variant/50 italic">No description provided.</p>
        )}
      </div>

      {/* Details */}
      <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Details</p>
        <div>
          <DetailRow label="Priority">
            {pcfg ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: pcfg.text }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: pcfg.dot }} />
                {task.priority}
              </span>
            ) : <span className="text-xs text-on-surface-variant/40">—</span>}
          </DetailRow>

          <DetailRow label="Deadline">
            {task.deadline ? (
              <span className="text-xs font-semibold" style={{ color: isOverdue ? "#b05555" : "#e5e2e1" }}>
                {formatDate(task.deadline)}
              </span>
            ) : <span className="text-xs text-on-surface-variant/40">None</span>}
          </DetailRow>

          {teamObj && (
            <DetailRow label="Team">
              <span className="text-xs font-medium text-on-surface">{teamObj.name}</span>
            </DetailRow>
          )}

          {projectName && (
            <DetailRow label="Project">
              <span className="text-xs font-medium text-on-surface">{projectName}</span>
            </DetailRow>
          )}

          <DetailRow label="Assignee">
            {assigneeUser ? (
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs font-medium text-on-surface">
                  {assigneeUser.name || assigneeUser.email?.split("@")[0]}
                </span>
                <Avatar name={assigneeUser.name || assigneeUser.email || "?"} size={22} />
              </div>
            ) : <span className="text-xs text-on-surface-variant/40">Unassigned</span>}
          </DetailRow>

          <DetailRow label="Created">
            <span className="text-xs text-on-surface-variant">{formatDate(task.createdAt)}</span>
          </DetailRow>
        </div>
      </div>

      {/* Attachments */}
      <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-on-surface">
            Attachments {imageUrl && <span className="text-on-surface-variant font-normal ml-1">(1)</span>}
          </h2>
          {imageUrl && isManager && (
            <button type="button" onClick={handleRemoveAttachment}
              className="text-xs text-on-surface-variant hover:text-error transition-colors">
              Remove
            </button>
          )}
        </div>

        {imageUrl ? (
          <a href={imageUrl} target="_blank" rel="noopener noreferrer"
             className="group relative block rounded-lg overflow-hidden border border-outline-variant"
             style={{ width: 120, height: 96 }}>
            <img
              src={imageUrl}
              alt="Attachment"
              className="w-full h-full object-cover group-hover:opacity-70 transition-opacity"
              onError={async (e) => {
                if (e.currentTarget.dataset.fellBack) return;
                e.currentTarget.dataset.fellBack = "1";
                const { original } = await fetchTaskImageUrls(taskId);
                if (original) e.currentTarget.src = original;
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
          </a>
        ) : isManager ? (
          <div
            onDragOver={e => { e.preventDefault(); if (!uploading) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false);
              if (uploading) return;
              const f = e.dataTransfer.files[0]; if (f) handleUpload(f);
            }}
            onClick={() => { if (!uploading) fileRef.current?.click(); }}
            className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
            style={{
              borderColor: dragOver ? "#8e9192" : "#444748",
              background: dragOver ? "rgba(255,255,255,0.02)" : "transparent",
              cursor: uploading ? "wait" : "pointer",
            }}>
            {uploading ? (
              <>
                <div className="w-5 h-5 border-2 border-surface-variant border-t-on-surface rounded-full animate-spin" />
                <p className="text-xs text-on-surface-variant">Uploading…</p>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                </svg>
                <p className="text-xs text-on-surface">Click to upload or drag and drop</p>
                <p className="text-[10px] text-on-surface-variant/60">SVG, PNG, JPG or PDF — max 10 MB</p>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-on-surface-variant/50 italic">No attachment.</p>
        )}

        <input ref={fileRef} type="file" accept=".svg,.png,.jpg,.jpeg,.pdf" className="hidden"
               onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />

        {uploadError && (
          <p className="mt-3 text-xs text-error">{uploadError}</p>
        )}
      </div>

      {/* Comments */}
      <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
        <h2 className="text-sm font-semibold text-on-surface mb-5">
          Comments
          {comments.length > 0 && (
            <span className="ml-2 text-xs font-normal text-on-surface-variant">({comments.length})</span>
          )}
        </h2>

        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <p className="text-xs text-on-surface-variant">No comments yet</p>
          </div>
        ) : (
          <div className="space-y-5 mb-6">
            {comments.map(c => {
              const name = displayName(c.authorId);
              return (
                <div key={c.commentId} className="flex gap-3">
                  <Avatar name={name} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-sm font-semibold text-on-surface">{name}</span>
                      <span className="text-xs text-on-surface-variant/60">{timeAgo(c.createdAt)}</span>
                    </div>
                    <div className="rounded-lg px-4 py-3 text-sm leading-relaxed text-on-surface bg-surface border border-outline-variant/60">
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
          {user && <Avatar name={user.name || user.email || "?"} size={32} />}
          <div className="flex-1">
            <textarea
              value={commentBody}
              onChange={e => setCommentBody(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleComment(); }}
              placeholder="Add a comment… (Ctrl+Enter to submit)"
              rows={3}
              className="w-full px-4 py-3 text-sm rounded-lg bg-surface border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none resize-none transition-colors"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-on-surface-variant/50">Ctrl+Enter to submit</span>
              <button type="button" onClick={handleComment}
                disabled={!commentBody.trim() || submitting}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-40">
                {submitting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="bg-surface-container rounded-xl border border-outline-variant p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-4">History</p>
        <ActivityFeed taskId={taskId} limit={8} />
      </div>

      {/* Manager actions */}
      {isManager && (
        <div className="space-y-2">
          <button type="button" onClick={onEdit}
            className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Task
          </button>

          {confirmDel ? (
            <div className="rounded-lg p-4 space-y-3"
                 style={{ background: "rgba(255,180,171,0.07)", border: "1px solid rgba(255,180,171,0.2)" }}>
              <p className="text-xs font-semibold text-error">Delete this task? This cannot be undone.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDel(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ background: "#7a2e2e" }}>
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDel(true)}
              className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors text-error border"
              style={{ borderColor: "rgba(255,180,171,0.2)", background: "rgba(255,180,171,0.05)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Delete Task
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export default function TaskPanel({ task, onClose, onChanged }: {
  task: string; onClose: () => void; onChanged: () => void;
}) {
  const isNew = task === "new";
  const [editing, setEditing] = useState(false);

  const title = isNew ? "Create Task" : editing ? "Edit Task" : "Task Details";

  return (
    <SlideOver open onClose={onClose} title={title} width={520}>
      {isNew ? (
        <TaskForm
          taskId={null}
          onSaved={() => { onChanged(); onClose(); }}
          onCancel={onClose}
        />
      ) : editing ? (
        <TaskForm
          taskId={task}
          onSaved={() => { onChanged(); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <TaskView
          taskId={task}
          onChanged={onChanged}
          onClose={onClose}
          onEdit={() => setEditing(true)}
        />
      )}
    </SlideOver>
  );
}
