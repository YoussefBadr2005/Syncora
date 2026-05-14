"use client";

import { useEffect, useRef, useState } from "react";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Team, User } from "@/types";

const C = { primary: "#232F3E", accent: "#FF9900", blue: "#0073BB", neutral: "#64748B" };

const ROLE_COLOR: Record<string, string> = {
  manager: C.accent, employee: C.blue, admin: C.primary,
};

// ── Generic custom dropdown ───────────────────────────────────────────────────
function CustomSelect({ options, value, onChange, placeholder }: {
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
  return (
    <div ref={ref} className="relative w-full">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm bg-white text-left transition-all"
        style={{ border: `1.5px solid ${value ? C.accent : "#E2E8F0"}`, color: value ? C.primary : C.neutral }}>
        <span className="flex-1 truncate">{selected?.label ?? placeholder ?? "Select…"}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl z-[60] overflow-hidden"
             style={{ border: "1.5px solid #E2E8F0" }}>
          {options.map(o => (
            <button key={o.value} type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
              style={{ color: o.value === value ? C.accent : C.primary, fontWeight: o.value === value ? 600 : 400 }}>
              {o.label}
              {o.value === value && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

// ── Filter dropdown (page-level filters) ─────────────────────────────────────
function FilterDropdown({ options, value, onChange, label }: {
  options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void; label: string;
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
  const active = value !== options[0].value;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white"
        style={{ border: `1.5px solid ${active ? C.accent : "#E2E8F0"}`, color: active ? C.accent : C.neutral, minWidth: 140 }}>
        <span className="flex-1 text-left">{selected?.label ?? label}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white rounded-xl shadow-xl z-50 overflow-hidden"
             style={{ border: "1.5px solid #E2E8F0", minWidth: "100%" }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
              style={{ color: o.value === value ? C.accent : C.primary, fontWeight: o.value === value ? 600 : 400 }}>
              {o.label}
              {o.value === value && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

const AVATAR_COLORS = ["#6366F1", "#EC4899", "#10B981", "#F59E0B", "#3B82F6", "#8B5CF6", "#EF4444", C.blue];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

// ── Create User Modal ─────────────────────────────────────────────────────────
function CreateUserModal({ teams, onClose, onCreated }: {
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

  const avatarBg  = name.trim() ? getAvatarColor(name.trim()) : C.neutral;
  const avatarIni = getInitials(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError("Name and email are required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!teamId) { setError("Please select a team for this employee."); return; }
    setError(""); setLoading(true);
    try {
      const res = await api.post("/users", {
        name: name.trim(), email: email.trim(), password,
        role: "employee", teamId,
      });
      onCreated(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
           style={{ border: "1px solid #E2E8F0" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5"
             style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center gap-3">
            {/* Live avatar preview */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm transition-all"
                 style={{ background: avatarBg, letterSpacing: "0.02em" }}>
              {name.trim() ? avatarIni : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: C.primary }}>
                {name.trim() || "Create New User"}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: C.neutral }}>
                {email.trim() ? email.trim() : "New employees are assigned to a team immediately"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
            style={{ color: C.neutral }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-sm font-medium"
                 style={{ background: "#FFF4E5", color: "#B45309", border: "1px solid #FDE68A" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Name + Email side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: C.primary }}>Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Sara Hassan"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
                style={{ border: `1.5px solid ${name ? C.accent : "#E2E8F0"}`, color: C.primary }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: C.primary }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="sara@demo.com"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
                style={{ border: `1.5px solid ${email ? C.accent : "#E2E8F0"}`, color: C.primary }} />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.primary }}>Password</label>
            <div className="relative">
              <input type={showPass ? "text" : "password"} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
                className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl outline-none transition-all"
                style={{ border: `1.5px solid ${password ? C.accent : "#E2E8F0"}`, color: C.primary }} />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: C.neutral }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showPass
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
            <p className="text-xs mt-1.5" style={{ color: C.neutral }}>User logs in with this password immediately — no reset required.</p>
          </div>

          {/* Team */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.primary }}>Team</label>
            <CustomSelect
              options={teamOptions}
              value={teamId}
              onChange={setTeamId}
              placeholder="Select a team…"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-gray-50"
              style={{ border: "1.5px solid #E2E8F0", color: C.neutral }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: C.accent }}>
              {loading ? "Creating…" : "Create User"}
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
    } catch {
      setError("Failed to save changes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm"
           style={{ border: "1px solid #E2E8F0" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5"
             style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: C.blue + "18" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: C.primary }}>Assign Team</h2>
              <p className="text-xs mt-0.5 truncate max-w-[180px]" style={{ color: C.neutral }}>{user.name || user.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
            style={{ color: C.neutral }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-sm font-medium"
                 style={{ background: "#FFF4E5", color: "#B45309", border: "1px solid #FDE68A" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: C.primary }}>Team</label>
            <CustomSelect options={teamOptions} value={teamId} onChange={setTeamId} placeholder="Select a team…" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:bg-gray-50"
              style={{ border: "1.5px solid #E2E8F0", color: C.neutral }}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: C.blue }}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers]     = useState<User[]>([]);
  const [teams, setTeams]     = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [assignUser, setAssignUser] = useState<User | null>(null);

  useEffect(() => {
    if (!me) return;
    Promise.all([
      api.get("/users").then(r => r.data as User[]),
      api.get("/teams").then(r => r.data as Team[]),
    ]).then(([u, t]) => { setUsers(u); setTeams(t); })
      .finally(() => setLoading(false));
  }, [me]);

  const teamMap = Object.fromEntries(teams.map(t => [t.teamId, t.name]));

  const filtered = users.filter(u => {
    if (teamFilter !== "all" && u.teamId !== teamFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const teamOptions = [
    { value: "all", label: "All Teams" },
    ...teams.map(t => ({ value: t.teamId, label: t.name })),
  ];
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

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.primary }}>Directory</h1>
          <p className="text-sm mt-1" style={{ color: C.neutral }}>Manage users and team assignments.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: C.accent }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
          </svg>
          Create User
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1" style={{ minWidth: 260 }}>
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" width="14" height="14"
               viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-white outline-none"
            style={{ border: `1.5px solid ${search ? C.accent : "#E2E8F0"}`, color: C.primary }} />
        </div>
        <FilterDropdown options={teamOptions} value={teamFilter} onChange={setTeamFilter} label="All Teams" />
        <span className="ml-auto text-sm font-medium" style={{ color: C.neutral }}>
          {filtered.length} of {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── User cards grid ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.neutral + "44"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <p className="text-sm font-medium" style={{ color: C.neutral }}>No users found</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {filtered.map(u => {
            const roleColor = ROLE_COLOR[u.role] ?? C.neutral;
            const initials  = (u.name || u.email || "?").charAt(0).toUpperCase();

            return (
              <div key={u.userId} className="bg-white rounded-2xl overflow-hidden transition-shadow hover:shadow-md"
                   style={{ border: "1px solid #E4E9EF", borderTop: `3px solid ${roleColor}` }}>

                {/* Card header */}
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0"
                         style={{ background: C.primary }}>
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: C.primary }}>
                        {u.name || <span style={{ color: C.neutral }}>No name</span>}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <p className="text-xs truncate" style={{ color: C.neutral }}>{u.email}</p>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Details panel */}
                <div className="mx-4 mb-4 px-4 py-3 rounded-xl space-y-2.5"
                     style={{ background: "#F8FAFC", border: "1px solid #E4E9EF" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.neutral }}>ID</span>
                    <code className="text-xs px-2 py-0.5 rounded-md font-mono"
                          style={{ background: "white", color: C.primary, border: "1px solid #E4E9EF" }}>
                      {u.userId.slice(0, 14)}…
                    </code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.neutral }}>Team</span>
                    <span className="text-xs font-semibold" style={{ color: C.primary }}>
                      {teamMap[u.teamId] ?? <span style={{ color: C.neutral + "88" }}>—</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.neutral }}>Role</span>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full capitalize"
                          style={{ background: roleColor + "15", color: roleColor }}>
                      {u.role}
                    </span>
                  </div>
                </div>

                {/* Footer — single action */}
                <div style={{ borderTop: "1px solid #F1F5F9" }}>
                  <button type="button" onClick={() => setAssignUser(u)}
                    className="w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                    style={{ color: C.primary }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    </svg>
                    Assign Team
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <CreateUserModal
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
    </ProtectedLayout>
  );
}
