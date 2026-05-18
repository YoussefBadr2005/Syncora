"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Team, User, Project, Task } from "@/types";

const PRIORITY_CONFIG = {
  Low:      { dot: "#6b7280", text: "#9ca3af" },
  Medium:   { dot: "#7a6520", text: "#9e8438" },
  High:     { dot: "#7a4a25", text: "#9e6840" },
  Critical: { dot: "#8b3535", text: "#b05555" },
} as const;

// ── Date Picker ───────────────────────────────────────────────────────────────
function DatePicker({ value, onChange, min }: {
  value: string; onChange: (v: string) => void; min?: string;
}) {
  const [open, setOpen]           = useState(false);
  const [viewYear, setViewYear]   = useState(() => value ? new Date(value + "T00:00:00").getFullYear()  : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? new Date(value + "T00:00:00").getMonth()     : new Date().getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const today    = new Date(); today.setHours(0,0,0,0);
  const minDate  = min ? new Date(min + "T00:00:00") : null;
  const selected = value ? new Date(value + "T00:00:00") : null;

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const selectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    if (minDate && d < minDate) return;
    onChange(`${viewYear}-${String(viewMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
    setOpen(false);
  };

  const displayValue = selected
    ? selected.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm text-left transition-colors bg-surface-container border border-outline-variant focus:border-outline focus:outline-none"
        style={{ color: value ? "#e5e2e1" : "#8e9192" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" style={{ color: "#8e9192" }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="flex-1">{displayValue || "Pick a date"}</span>
        {value && (
          <span role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(""); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onChange(""); } }}
            className="w-4 h-4 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0 cursor-pointer">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-surface-container-low border border-outline-variant rounded-xl z-50 p-4"
             style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.5)", minWidth: 280 }}>

          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={prevMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="text-sm font-semibold text-on-surface">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="flex items-center justify-center h-7 text-xs font-semibold text-on-surface-variant">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const thisDate = new Date(viewYear, viewMonth, day);
              const isToday  = thisDate.getTime() === today.getTime();
              const isSel    = selected && thisDate.getTime() === selected.getTime();
              const disabled = !!(minDate && thisDate < minDate);
              return (
                <button key={i} type="button" onClick={() => selectDay(day)} disabled={disabled}
                  className="flex items-center justify-center h-8 w-full rounded-lg text-sm transition-colors disabled:opacity-25 disabled:cursor-not-allowed hover:bg-surface-container-high"
                  style={{
                    background: isSel ? "#e5e2e1" : isToday ? "rgba(255,255,255,0.08)" : "transparent",
                    color: isSel ? "#141313" : "#e5e2e1",
                    fontWeight: isSel || isToday ? 700 : 400,
                  }}>
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-outline-variant">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Clear
            </button>
            <button type="button" onClick={() => { setViewYear(new Date().getFullYear()); setViewMonth(new Date().getMonth()); }}
              className="text-xs font-medium px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dropdown ──────────────────────────────────────────────────────────────────
function Dropdown({ value, onChange, placeholder, options, disabled = false }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  options: { value: string; label: string; sub?: string; dot?: string }[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm text-left transition-colors bg-surface-container border border-outline-variant focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ color: selected ? "#e5e2e1" : "#8e9192" }}>
        {selected?.dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selected.dot }} />}
        <span className="flex-1 truncate">{selected?.label ?? placeholder}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
             className={`flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg z-[100] overflow-y-auto"
             style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.5)", maxHeight: 220 }}>
          {options.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-surface-container-high transition-colors"
              style={{ color: opt.value === value ? "#e5e2e1" : "#8e9192" }}>
              {opt.dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.dot }} />}
              <span className="flex-1 min-w-0">
                <span className="font-medium block truncate">{opt.label}</span>
                {opt.sub && <span className="text-xs text-on-surface-variant truncate block mt-0.5">{opt.sub}</span>}
              </span>
              {opt.value === value && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e5e2e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

// ── Field label ───────────────────────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
      {children}{required && <span className="ml-1 text-error normal-case tracking-normal font-normal">*</span>}
    </label>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant">
      <div className="px-5 py-3.5 border-b border-outline-variant bg-surface-container-high/40">
        <h2 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{title}</h2>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function CreateTaskPageContent() {
  const { user }       = useAuth();
  const router         = useRouter();
  const searchParams   = useSearchParams();
  const editTaskId     = searchParams.get("edit");
  const isEdit         = !!editTaskId;

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
      isEdit ? api.get(`/tasks/${editTaskId}`).then(r => r.data as Task) : Promise.resolve(null),
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
  }, [user, isEdit, editTaskId]);

  useEffect(() => {
    if (!didPrefill && !isEdit) { setAssigneeId(""); setProjectId(""); return; }
    if (didPrefill) { setDidPrefill(false); return; }
    setAssigneeId(""); setProjectId("");
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFile(f: File) {
    const ok = ["image/svg+xml","image/png","image/jpeg","application/pdf"];
    if (!ok.includes(f.type))      { setError("Only SVG, PNG, JPG or PDF allowed."); return; }
    if (f.size > 10 * 1024 * 1024) { setError("File must be under 10 MB."); return; }
    setError(""); setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!title.trim()) return setError("Task title is required.");
    if (!priority)     return setError("Priority is required.");
    if (!deadline)     return setError("Deadline is required.");
    if (!teamId)       return setError("Target team is required.");
    if (!assigneeId)   return setError("Assignee is required.");
    if (!projectId)    return setError("Project is required.");
    setSubmitting(true);
    try {
      let taskId: string;
      if (isEdit) {
        await api.put(`/tasks/${editTaskId}`, {
          title: title.trim(), description: description.trim(),
          priority, deadline, teamId, assigneeId,
        });
        taskId = editTaskId!;
      } else {
        const { data: created } = await api.post("/tasks", {
          title: title.trim(), description: description.trim(),
          priority, deadline, teamId, assigneeId, projectId,
        });
        taskId = created.taskId;
      }
      if (file) {
        const { data: { uploadUrl } } = await api.post(`/tasks/${taskId}/image`, {
          filename: file.name, contentType: file.type,
        });
        await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      }
      router.push(`/tasks/${taskId}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (isEdit ? "Failed to update task." : "Failed to create task."));
    } finally { setSubmitting(false); }
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

  const priorityOptions = Object.entries(PRIORITY_CONFIG).map(([v, c]) => ({ value: v, label: v, dot: c.dot }));
  const teamOptions     = teams.map(t => ({ value: t.teamId, label: t.name }));
  const projectOptions  = teamProjects.map(p => ({ value: p.projectId, label: p.name }));
  const assigneeOptions = teamUsers.map(u => ({ value: u.userId, label: u.name || u.email.split("@")[0], sub: u.email }));

  return (
    <ProtectedLayout>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">{isEdit ? "Edit Task" : "Create Task"}</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {isEdit
                ? "Update the task parameters. Changes apply immediately."
                : "Define the task parameters. The assignee will be notified on creation."}
            </p>
          </div>
          <Link href="/tasks"
            className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Basics ── */}
          <Section title="Task details">

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
          </Section>

          {/* ── Assignment ── */}
          <Section title="Assignment">

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
          </Section>

          {/* ── Attachment ── */}
          <Section title="Attachment">
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
                className="flex flex-col items-center justify-center gap-3 py-10 rounded-lg border-2 border-dashed cursor-pointer transition-colors"
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
                   onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </Section>

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
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/tasks"
              className="px-5 py-2.5 rounded-lg text-sm font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Cancel
            </Link>
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
      </div>
    </ProtectedLayout>
  );
}

function CreateTaskPageFallback() {
  return (
    <ProtectedLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
      </div>
    </ProtectedLayout>
  );
}

export default function CreateTaskPage() {
  return (
    <Suspense fallback={<CreateTaskPageFallback />}>
      <CreateTaskPageContent />
    </Suspense>
  );
}
