"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Team, User } from "@/types";

const PAGE_SIZE = 10;

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

// ── Dropdown ──────────────────────────────────────────────────────────────────
function Dropdown({ options, value, onChange, placeholder }: {
  options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const selected = options.find(o => o.value === value);
  const active = !!value && value !== options[0]?.value;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors"
        style={{
          background: active ? "rgba(255,255,255,0.05)" : "transparent",
          borderColor: active ? "#8e9192" : "#444748",
          color: active ? "#e5e2e1" : "#8e9192",
          minWidth: 130,
        }}>
        <span className="flex-1 text-left truncate">{selected?.label ?? placeholder ?? "Select…"}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-surface-container-low border border-outline-variant rounded-lg z-50 overflow-hidden"
             style={{ minWidth: "100%", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-container-high transition-colors flex items-center justify-between"
              style={{ color: o.value === value ? "#e5e2e1" : "#8e9192", fontWeight: o.value === value ? 600 : 400 }}>
              {o.label}
              {o.value === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e5e2e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

// ── Row action menu ───────────────────────────────────────────────────────────
function RowMenu({ onAssign, onDelete }: { onAssign: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative flex justify-end">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 overflow-hidden"
             style={{ minWidth: 160, background: "#1c1b1b", border: "1px solid #444748", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)" }}>
          <div className="p-1">
            <button type="button" onClick={() => { onAssign(); setOpen(false); }}
              className="w-full text-left flex items-center gap-2.5 transition-colors"
              style={{ padding: "6px 8px", borderRadius: 6, fontSize: 13, color: "#8e9192" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "#e5e2e1"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#8e9192"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              Reassign Team
            </button>
            <div style={{ height: 1, background: "#444748", margin: "4px 8px" }} />
            <button type="button" onClick={() => { onDelete(); setOpen(false); }}
              className="w-full text-left flex items-center gap-2.5 transition-colors"
              style={{ padding: "6px 8px", borderRadius: 6, fontSize: 13, color: "#b05555" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(176,85,85,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#d07070"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#b05555"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              Remove Employee
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateEmployeeModal({ teams, onClose, onCreated }: {
  teams: Team[]; onClose: () => void; onCreated: (u: User) => void;
}) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [teamId, setTeamId]     = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const teamOptions = teams.map(t => ({ value: t.teamId, label: t.name }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!teamId) { setError("Please select a team."); return; }
    setError(""); setLoading(true);
    try {
      const res = await api.post("/users", {
        name: name.trim(), email: email.trim(), password,
        role: "employee",
        teamId,
      });
      onCreated(res.data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create user.");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
      <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-md"
           style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Add employee</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              New employees can log in immediately with the given password.
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors flex-shrink-0 ml-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3.5 py-3 rounded-lg text-sm text-error"
                 style={{ background: "rgba(255,180,171,0.08)", border: "1px solid rgba(255,180,171,0.2)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}


          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Sara Hassan" autoFocus
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sara@company.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Password</label>
            <div className="relative">
              <input type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
                className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors" />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showPass
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
                </svg>
              </button>
            </div>
          </div>

          <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Team</label>
              <Dropdown options={[{ value: "", label: "Select a team…" }, ...teamOptions]} value={teamId} onChange={setTeamId} placeholder="Select a team…" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? "Creating…" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assign Team Modal ─────────────────────────────────────────────────────────
function AssignTeamModal({ user, teams, onClose, onSaved }: {
  user: User; teams: Team[]; onClose: () => void; onSaved: (u: User) => void;
}) {
  const [teamId, setTeamId]   = useState(user.teamId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const teamOptions = [
    { value: "", label: "No team" },
    ...teams.map(t => ({ value: t.teamId, label: t.name })),
  ];

  const save = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.put(`/users/${user.userId}`, { teamId });
      onSaved({ ...user, ...res.data });
    } catch { setError("Failed to save changes."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
      <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-sm"
           style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
          <div>
            <h2 className="text-sm font-semibold text-on-surface">Reassign team</h2>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate max-w-[200px]">{user.name || user.email}</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3.5 py-3 rounded-lg text-sm text-error"
                 style={{ background: "rgba(255,180,171,0.08)", border: "1px solid rgba(255,180,171,0.2)" }}>
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Team</label>
            <Dropdown options={teamOptions} value={teamId} onChange={setTeamId} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="grid items-center px-6 py-4 border-b border-outline-variant/50 animate-pulse"
         style={{ gridTemplateColumns: "2fr 1fr 1fr 48px" }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-surface-container-high flex-shrink-0" />
        <div className="space-y-1.5">
          <div className="h-3 w-28 bg-surface-container-high rounded" />
          <div className="h-2.5 w-36 bg-surface-container-high/60 rounded" />
        </div>
      </div>
      <div className="h-3 w-20 bg-surface-container-high rounded" />
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-surface-container-high" />
        <div className="h-3 w-10 bg-surface-container-high rounded" />
      </div>
      <div className="w-8 h-8 rounded-lg bg-surface-container-high ml-auto" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const router = useRouter();
  const { user: me, isManager } = useAuth();

  const [users, setUsers]     = useState<User[]>([]);
  const [teams, setTeams]     = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [assignUser, setAssignUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!me) return;
    if (!isManager) {
      router.replace("/dashboard");
      return;
    }
    Promise.all([
      api.get("/users").then(r => r.data as User[]),
      api.get("/teams").then(r => r.data as Team[]),
    ]).then(([u, t]) => { setUsers(u); setTeams(t); })
      .finally(() => setLoading(false));
  }, [me, isManager, router]);

  const teamMap = Object.fromEntries(teams.map(t => [t.teamId, t.name]));

  const filtered = users.filter(u => {
    if (u.userId === me?.userId) return false;
    if (teamFilter && u.teamId !== teamFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, teamFilter]);

  const teamOptions = [
    { value: "", label: "All Teams" },
    ...teams.map(t => ({ value: t.teamId, label: t.name })),
  ];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true); setDeleteError("");
    try {
      await api.delete(`/users/${deleteTarget.userId}`);
      setUsers(prev => prev.filter(u => u.userId !== deleteTarget.userId));
      setDeleteTarget(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to remove employee.";
      setDeleteError(msg);
    } finally { setDeleteLoading(false); }
  };

  return (
    <ProtectedLayout>

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">
            {"Employees"}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {"Manage your organisation's employees and team assignments."}
          </p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {"Add Employee"}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1" style={{ minWidth: 240, maxWidth: 360 }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
               viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 focus:border-outline focus:ring-0 focus:outline-none transition-colors" />
        </div>
        <Dropdown options={teamOptions} value={teamFilter} onChange={setTeamFilter} placeholder="All Teams" />
      </div>

      {/* Table */}
      <div className="bg-surface-container rounded-xl border border-outline-variant overflow-hidden">

        {/* Header */}
        <div className="grid px-6 py-3 border-b border-outline-variant bg-surface-container-high/40 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
             style={{ gridTemplateColumns: "2fr 1fr 1fr 48px" }}>
          <span>User</span>
          <span>Team</span>
          <span>{"Status"}</span>
          <span />
        </div>

        {/* Body */}
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <p className="text-sm text-on-surface font-medium">{"No employees found"}</p>
            <p className="text-xs text-on-surface-variant">Try adjusting your filters.</p>
          </div>
        ) : (
          paginated.map((u, i) => {
            const name = u.name || u.email || "Unknown";
            const isLast = i === paginated.length - 1;

            return (
              <div key={u.userId}
                className="grid items-center px-6 py-4 hover:bg-surface-container-high/40 transition-colors"
                style={{
                  gridTemplateColumns: "2fr 1fr 1fr 48px",
                  borderBottom: isLast ? "none" : "1px solid #444748",
                }}>

                {/* User */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface text-xs font-semibold flex-shrink-0">
                    {getInitials(name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate leading-none">{u.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">{u.email}</p>
                  </div>
                </div>

                {/* Team */}
                <div>
                  {teamMap[u.teamId] ? (
                    <span className="text-sm text-on-surface-variant">{teamMap[u.teamId]}</span>
                  ) : (
                    <span className="text-sm text-on-surface-variant/40">—</span>
                  )}
                </div>

                {/* Role (admin view) or Status (manager view) */}
                <div className="flex items-center gap-1.5">
                  <>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#2d6e52" }} />
                      <span className="text-sm text-on-surface-variant">Active</span>
                    </>
                </div>

                {/* Actions */}
                <RowMenu onAssign={() => setAssignUser(u)} onDelete={() => { setDeleteError(""); setDeleteTarget(u); }} />
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-5 px-1">
          <p className="text-sm text-on-surface-variant">
            Showing <span className="text-on-surface font-medium">{(page - 1) * PAGE_SIZE + 1}</span> to{" "}
            <span className="text-on-surface font-medium">{Math.min(page * PAGE_SIZE, filtered.length)}</span> of{" "}
            <span className="text-on-surface font-medium">{filtered.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Previous
            </button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateEmployeeModal
          teams={teams}
          onClose={() => setShowCreate(false)}
          onCreated={u => { setUsers(prev => [...prev, u]); setShowCreate(false); }}
        />
      )}
      {assignUser && (
        <AssignTeamModal
          user={assignUser} teams={teams}
          onClose={() => setAssignUser(null)}
          onSaved={u => { setUsers(prev => prev.map(x => x.userId === u.userId ? u : x)); setAssignUser(null); }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
          <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-sm"
               style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>
            <div className="px-6 py-5 border-b border-outline-variant">
              <h2 className="text-sm font-semibold text-on-surface">Remove employee</h2>
              <p className="text-xs text-on-surface-variant mt-1">
                <span className="text-on-surface font-medium">{deleteTarget.name || deleteTarget.email}</span> will be
                deactivated and can no longer log in. This cannot be undone.
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              {deleteError && (
                <div className="flex items-center gap-2 px-3.5 py-3 rounded-lg text-sm text-error"
                     style={{ background: "rgba(255,180,171,0.08)", border: "1px solid rgba(255,180,171,0.2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {deleteError}
                </div>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={confirmDelete} disabled={deleteLoading}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ background: "#8b3535", color: "#ffdad6" }}
                  onMouseEnter={e => { if (!deleteLoading) (e.currentTarget as HTMLButtonElement).style.background = "#a04040"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#8b3535"; }}>
                  {deleteLoading ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedLayout>
  );
}
