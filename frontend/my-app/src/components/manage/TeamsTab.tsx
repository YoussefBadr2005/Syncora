"use client";

import { useCallback, useEffect, useState } from "react";
import SlideOver from "@/components/ui/SlideOver";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import api from "@/lib/api";
import type { Team, User } from "@/types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Create Team panel ──────────────────────────────────────────────────────────
function CreateTeamForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Team name is required."); return; }
    setLoading(true); setError("");
    try {
      await api.post("/teams", { name: name.trim() });
      toast("Team created.", "success");
      onCreated();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create team.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
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
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? "Creating…" : "Create team"}
        </Button>
      </div>
    </form>
  );
}

// ── Team row ───────────────────────────────────────────────────────────────────
function TeamRow({ team, memberCount }: { team: Team; memberCount: number }) {
  return (
    <div className="bg-surface-container border border-outline-variant rounded-xl px-5 py-4 flex items-center gap-3 hover:border-outline transition-colors">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-surface-container-high text-on-surface text-sm font-bold flex-shrink-0 border border-outline-variant">
        {initials(team.name)}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-on-surface truncate">{team.name}</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">
          {memberCount} member{memberCount !== 1 ? "s" : ""}
        </p>
      </div>
      <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant flex-shrink-0">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        {new Date(team.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
}

export default function TeamsTab() {
  const [teams, setTeams]     = useState<Team[]>([]);
  const [users, setUsers]     = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      api.get("/teams").then(r => r.data as Team[]),
      api.get("/users").then(r => r.data as User[]),
    ]).then(([t, u]) => { setTeams(t); setUsers(u); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const memberCount = (teamId: string) =>
    users.filter(u => u.teamId === teamId && u.role === "employee").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm text-on-surface-variant">
          {teams.length} team{teams.length !== 1 ? "s" : ""}
        </span>
        <Button onClick={() => setShowCreate(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New team
        </Button>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          hint="Create your first team to get started."
          action={<Button onClick={() => setShowCreate(true)}>Create team</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {teams.map(team => (
            <TeamRow key={team.teamId} team={team} memberCount={memberCount(team.teamId)} />
          ))}
        </div>
      )}

      <SlideOver open={showCreate} onClose={() => setShowCreate(false)} title="Create team">
        <CreateTeamForm
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      </SlideOver>
    </div>
  );
}
