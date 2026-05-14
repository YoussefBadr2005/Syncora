"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import Link from "next/link";
import type { Team, User, Project } from "@/types";

const C = {
  primary: "#232F3E",
  accent:  "#FF9900",
  blue:    "#0073BB",
  neutral: "#64748B",
};

const PRIORITIES = [
  { value: "Low",      color: C.neutral },
  { value: "Medium",   color: C.blue    },
  { value: "High",     color: C.accent  },
  { value: "Critical", color: C.primary },
] as const;

// ─── Custom Date Picker ───────────────────────────────────────────────────────
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

  const firstDay  = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
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
        className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-left transition-all bg-white"
        style={{
          border: `1.5px solid ${open ? C.accent : value ? C.accent + "55" : "#E2E8F0"}`,
          color: value ? C.primary : C.neutral,
          boxShadow: open ? `0 0 0 3px ${C.accent}18` : "none",
        }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={value ? C.accent : C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span className="flex-1">{displayValue || "Pick a date"}</span>
        {value && (
          <button type="button" onClick={e => { e.stopPropagation(); onChange(""); }}
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
            style={{ color: C.neutral }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 bg-white rounded-2xl z-50 p-4"
             style={{ border: "1.5px solid #E2E8F0", boxShadow: "0 8px 32px rgba(0,0,0,0.12)", minWidth: 280 }}>

          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={prevMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              style={{ color: C.neutral }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span className="text-sm font-bold" style={{ color: C.primary }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              style={{ color: C.neutral }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="flex items-center justify-center h-7 text-xs font-semibold"
                   style={{ color: C.neutral }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const thisDate  = new Date(viewYear, viewMonth, day);
              const isToday   = thisDate.getTime() === today.getTime();
              const isSel     = selected && thisDate.getTime() === selected.getTime();
              const disabled  = !!(minDate && thisDate < minDate);
              return (
                <button key={i} type="button" onClick={() => selectDay(day)} disabled={disabled}
                  className="flex items-center justify-center h-8 w-full rounded-lg text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: isSel ? C.accent : isToday ? C.accent + "18" : "transparent",
                    color: isSel ? "white" : isToday ? C.accent : C.primary,
                    fontWeight: isSel || isToday ? 700 : 400,
                  }}
                  onMouseEnter={e => { if (!isSel && !disabled) (e.currentTarget as HTMLButtonElement).style.background = C.accent + "15"; }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.background = isSel ? C.accent : isToday ? C.accent + "18" : "transparent"; }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid #F1F5F9" }}>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              style={{ color: C.neutral }}>
              Clear
            </button>
            <button type="button" onClick={() => {
              setViewYear(new Date().getFullYear());
              setViewMonth(new Date().getMonth());
            }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              style={{ color: C.accent }}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Custom Dropdown ──────────────────────────────────────────────────────────
function Dropdown({
  value, onChange, placeholder, options, disabled = false, icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string; sub?: string; dot?: string }[];
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white"
        style={{
          border: `1.5px solid ${open ? C.accent : value ? C.accent + "55" : "#E2E8F0"}`,
          color: selected ? C.primary : C.neutral,
          boxShadow: open ? `0 0 0 3px ${C.accent}18` : "none",
        }}
      >
        {icon && <span className="flex-shrink-0" style={{ color: C.neutral }}>{icon}</span>}
        {selected?.dot && (
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selected.dot }} />
        )}
        <span className="flex-1 truncate">{selected ? selected.label : placeholder}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke={C.neutral} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
             className={`flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl z-50 overflow-hidden"
             style={{ border: "1.5px solid #E2E8F0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
          {options.map(opt => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                style={{
                  background: isSelected ? C.accent + "12" : "transparent",
                  color: isSelected ? C.primary : C.primary,
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "#F8FAFC"; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                {opt.dot && (
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: opt.dot }} />
                )}
                <span className="flex-1">
                  <span className="font-medium">{opt.label}</span>
                  {opt.sub && <span className="block text-xs mt-0.5" style={{ color: C.neutral }}>{opt.sub}</span>}
                </span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                       stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CreateTaskPage() {
  const { user }  = useAuth();
  const router    = useRouter();

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

  const [file,     setFile]     = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const teamUsers    = users.filter(u => !teamId || u.teamId === teamId);
  const teamProjects = projects.filter(p => !teamId || p.teamId === teamId);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get("/teams").then(r => r.data as Team[]),
      api.get("/users").then(r => r.data as User[]),
      api.get("/projects").then(r => r.data as Project[]),
    ]).then(([t, u, p]) => {
      setTeams(t); setUsers(u); setProjects(p);
    }).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { setAssigneeId(""); setProjectId(""); }, [teamId]);

  function handleFile(f: File) {
    const ok = ["image/svg+xml", "image/png", "image/jpeg", "application/pdf"];
    if (!ok.includes(f.type))       { setError("Only SVG, PNG, JPG or PDF allowed."); return; }
    if (f.size > 10 * 1024 * 1024)  { setError("File must be under 10 MB."); return; }
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
      const { data: task } = await api.post("/tasks", {
        title: title.trim(), description: description.trim(),
        priority, deadline, teamId, assigneeId, projectId,
      });
      if (file) {
        const { data: { uploadUrl } } = await api.post(`/tasks/${task.taskId}/image`, {
          filename: file.name, contentType: file.type,
        });
        await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      }
      router.push(`/tasks/${task.taskId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Failed to create task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: C.accent }} />
        </div>
      </ProtectedLayout>
    );
  }

  const priorityOptions = PRIORITIES.map(p => ({ value: p.value, label: p.value, dot: p.color }));
  const teamOptions     = teams.map(t => ({ value: t.teamId, label: t.name }));
  const projectOptions  = teamProjects.map(p => ({ value: p.projectId, label: p.name }));
  const assigneeOptions = teamUsers.map(u => ({
    value: u.userId,
    label: u.name || u.email.split("@")[0],
    sub:   u.email,
  }));

  return (
    <ProtectedLayout>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: C.primary }}>Create New Task</h1>
          <p className="text-sm mt-1" style={{ color: C.neutral }}>
            Define parameters for a new task. An SNS notification will be sent to the assignee.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-7 space-y-6">

            {/* Title */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                Task Title <span style={{ color: C.accent }}>*</span>
              </label>
              <input
                type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Implement S3 Image Pipeline"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all bg-white"
                style={{
                  border: `1.5px solid ${title ? C.accent + "55" : "#E2E8F0"}`,
                  color: C.primary,
                  boxShadow: title ? `0 0 0 3px ${C.accent}18` : "none",
                }}
                onFocus={e  => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${C.accent}18`; }}
                onBlur={e   => { e.currentTarget.style.borderColor = title ? C.accent + "55" : "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* Priority + Deadline */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                  Priority <span style={{ color: C.accent }}>*</span>
                </label>
                <Dropdown
                  value={priority} onChange={setPriority}
                  placeholder="Select priority level"
                  options={priorityOptions}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                  Deadline <span style={{ color: C.accent }}>*</span>
                </label>
                <DatePicker
                  value={deadline}
                  onChange={setDeadline}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                Description
              </label>
              <div className="rounded-xl overflow-hidden transition-all"
                   style={{ border: "1.5px solid #E2E8F0" }}>
                <div className="flex items-center gap-0.5 px-3 py-2 border-b bg-gray-50" style={{ borderColor: "#E8ECF0" }}>
                  {[
                    { label: "B", title: "Bold",   style: { fontWeight: 800 }, action: () => setDescription(d => d + "**bold**") },
                    { label: "I", title: "Italic",  style: { fontStyle: "italic" as const }, action: () => setDescription(d => d + "_italic_") },
                  ].map(btn => (
                    <button key={btn.label} type="button" title={btn.title} onClick={btn.action}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs hover:bg-white transition-colors"
                      style={{ color: C.primary, ...btn.style }}>
                      {btn.label}
                    </button>
                  ))}
                  <button type="button" title="List" onClick={() => setDescription(d => d + "\n- ")}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                  </button>
                </div>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  rows={5} placeholder="Provide detailed steps, expected outcomes, or technical constraints..."
                  className="w-full px-4 py-3 text-sm outline-none resize-none bg-white"
                  style={{ color: C.primary }}
                />
              </div>
            </div>

            {/* Team + Project */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                  Target Team <span style={{ color: C.accent }}>*</span>
                </label>
                <Dropdown
                  value={teamId} onChange={setTeamId}
                  placeholder="Select team"
                  options={teamOptions}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                  Project <span style={{ color: C.accent }}>*</span>
                </label>
                <Dropdown
                  value={projectId} onChange={setProjectId}
                  placeholder={teamId ? "Select project" : "Select team first"}
                  options={projectOptions}
                  disabled={!teamId}
                />
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                Assignee <span style={{ color: C.accent }}>*</span>
              </label>
              <Dropdown
                value={assigneeId} onChange={setAssigneeId}
                placeholder={teamId ? "Select assignee" : "Select team first"}
                options={assigneeOptions}
                disabled={!teamId}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                }
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: C.primary }}>
                Attachments{" "}
                <span className="font-normal text-xs" style={{ color: C.neutral }}>(S3 Upload)</span>
              </label>

              {file ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                     style={{ background: C.accent + "0C", border: `1.5px solid ${C.accent}40` }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: C.accent + "20" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: C.primary }}>{file.name}</p>
                    <p className="text-xs" style={{ color: C.neutral }}>{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={() => setFile(null)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={e  => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl cursor-pointer transition-all"
                  style={{
                    border: `2px dashed ${dragOver ? C.accent : "#CBD5E1"}`,
                    background: dragOver ? C.accent + "06" : "#F8FAFC",
                  }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center"
                       style={{ background: C.blue + "15" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold" style={{ color: C.primary }}>Click to upload or drag and drop</p>
                    <p className="text-xs mt-0.5" style={{ color: C.neutral }}>SVG, PNG, JPG or PDF (max. 10MB)</p>
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors hover:bg-white"
                    style={{ borderColor: "#CBD5E1", color: C.primary }}>
                    Select Files
                  </button>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".svg,.png,.jpg,.jpeg,.pdf" className="hidden"
                     onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                   style={{ background: C.accent + "10", border: `1px solid ${C.accent}35` }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-sm font-medium" style={{ color: C.accent }}>{error}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-5">
            <Link href="/tasks"
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-gray-50"
              style={{ borderColor: "#E2E8F0", color: C.neutral }}>
              Cancel
            </Link>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: C.primary, boxShadow: submitting ? "none" : `0 2px 8px ${C.primary}40` }}>
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating…</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Create Task</>
              )}
            </button>
          </div>
        </form>
      </div>
    </ProtectedLayout>
  );
}
