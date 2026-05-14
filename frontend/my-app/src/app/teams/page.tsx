"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Team, User } from "@/types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Create Team Modal ─────────────────────────────────────────────────────────
function CreateTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: Team) => void }) {
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Team name is required."); return; }
    setLoading(true); setError("");
    try {
      const res = await api.post("/teams", { name: name.trim() });
      onCreated(res.data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create team.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
      <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-sm"
           style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
          <h2 className="text-sm font-semibold text-on-surface">Create new team</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
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
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Team name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Frontend, Backend, QA"
              autoFocus
              className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors disabled:opacity-50">
              {loading ? "Creating…" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Team Card ─────────────────────────────────────────────────────────────────
function TeamCard({ team, members, isManager }: { team: Team; members: User[]; isManager: boolean }) {
  const router = useRouter();
  const employeeMembers = members.filter(m => m.role === "employee");
  const preview = employeeMembers.slice(0, 3);

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant hover:border-outline transition-all flex flex-col">

      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-surface-container-high text-on-surface text-sm font-bold flex-shrink-0 border border-outline-variant">
            {initials(team.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-on-surface truncate">{team.name}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {employeeMembers.length} member{employeeMembers.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-outline-variant/60" />

      {/* Members preview */}
      <div className="px-5 py-4 flex-1">
        {preview.length === 0 ? (
          <p className="text-xs text-on-surface-variant/50 py-1">No members yet</p>
        ) : (
          <div className="space-y-3">
            {preview.map(m => (
              <div key={m.userId} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface text-[11px] font-semibold flex-shrink-0">
                  {(m.name || m.email || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-on-surface truncate leading-none">{m.name || m.email}</p>
                  {m.name && <p className="text-[10px] text-on-surface-variant truncate mt-0.5">{m.email}</p>}
                </div>
              </div>
            ))}
            {employeeMembers.length > 3 && (
              <p className="text-[11px] text-on-surface-variant/70">
                +{employeeMembers.length - 3} more member{employeeMembers.length - 3 !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-5 pt-3 border-t border-outline-variant/60 flex items-center justify-between">
        {isManager ? (
          <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {new Date(team.createdAt).toLocaleDateString()}
          </span>
        ) : <span />}
        <button
          onClick={() => router.push(`/teams/${team.teamId}`)}
          className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
        >
          View team
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamsPage() {
  const { user, isManager } = useAuth();
  const [teams, setTeams]   = useState<Team[]>([]);
  const [users, setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetches: Promise<unknown>[] = [
      api.get("/teams").then(r => setTeams(r.data as Team[])),
    ];
    if (isManager) {
      fetches.push(api.get("/users").then(r => setUsers(r.data as User[])));
    }
    Promise.all(fetches).finally(() => setLoading(false));
  }, [user, isManager]);

  const filtered = teams.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const membersForTeam = (teamId: string) => users.filter(u => u.teamId === teamId);

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
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Teams</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {isManager
              ? "Manage your organisation's teams and members."
              : "Your team details and members."}
          </p>
        </div>
        {isManager && (
          <button type="button" onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Team
          </button>
        )}
      </div>

      {/* Search bar (manager only) */}
      {isManager && (
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
                 viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search teams…"
              className="pl-9 pr-4 py-2 text-sm rounded-full bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 focus:border-outline focus:ring-0 focus:outline-none transition-colors"
              style={{ width: 220 }}
            />
          </div>
          <span className="text-sm text-on-surface-variant">
            {filtered.length} team{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">
              {isManager ? "No teams yet" : "Not assigned to a team"}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">
              {isManager ? "Create your first team to get started." : "Contact your manager to be added to a team."}
            </p>
          </div>
          {isManager && (
            <button type="button" onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
              Create Team
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(team => (
            <TeamCard
              key={team.teamId}
              team={team}
              members={isManager ? membersForTeam(team.teamId) : users}
              isManager={isManager}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTeamModal
          onClose={() => setShowCreate(false)}
          onCreated={t => { setTeams(prev => [...prev, t]); setShowCreate(false); }}
        />
      )}
    </ProtectedLayout>
  );
}
