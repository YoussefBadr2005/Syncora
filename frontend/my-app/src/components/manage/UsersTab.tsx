"use client";

import { useCallback, useEffect, useState } from "react";
import SlideOver from "@/components/ui/SlideOver";
import Dropdown from "@/components/ui/Dropdown";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import api from "@/lib/api";
import type { Team, User } from "@/types";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

// ── Edit user panel ────────────────────────────────────────────────────────────
function EditUserForm({ user, teams, onClose, onSaved }: {
  user: User; teams: Team[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
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
      await api.put(`/users/${user.userId}`, { teamId });
      toast("User updated.", "success");
      onSaved();
    } catch {
      setError("Failed to save changes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-1">
        <div className="w-9 h-9 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface text-xs font-semibold flex-shrink-0">
          {getInitials(user.name || user.email || "?")}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-on-surface truncate leading-none">{user.name || "—"}</p>
          <p className="text-xs text-on-surface-variant truncate mt-0.5">{user.email}</p>
        </div>
        <span className="ml-auto text-xs px-2 py-0.5 rounded-full capitalize text-on-surface-variant bg-surface-container-high border border-outline-variant flex-shrink-0">
          {user.role}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3.5 py-3 rounded-lg text-sm text-error"
             style={{ background: "rgba(255,180,171,0.08)", border: "1px solid rgba(255,180,171,0.2)" }}>
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">Team</label>
        <Dropdown options={teamOptions} value={teamId} onChange={setTeamId} placeholder="No team" />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="button" className="flex-1" onClick={save} disabled={loading}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export default function UsersTab() {
  const [users, setUsers]     = useState<User[]>([]);
  const [teams, setTeams]     = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<User | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api.get("/users").then(r => r.data as User[]),
      api.get("/teams").then(r => r.data as Team[]),
    ]).then(([u, t]) => { setUsers(u); setTeams(t); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const teamMap = Object.fromEntries(teams.map(t => [t.teamId, t.name]));

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
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
      </div>

      {users.length === 0 ? (
        <EmptyState title="No users found" hint="Users you add will appear here." />
      ) : (
        <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
          <div className="grid px-6 py-3 border-b border-outline-variant bg-surface-container-high/40 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
               style={{ gridTemplateColumns: "2fr 1fr 1fr 88px" }}>
            <span>User</span>
            <span>Role</span>
            <span>Team</span>
            <span />
          </div>

          {users.map((u, i) => {
            const name = u.name || u.email || "Unknown";
            const isLast = i === users.length - 1;
            return (
              <div key={u.userId}
                className="grid items-center px-6 py-4 hover:bg-surface-container-high/40 transition-colors"
                style={{
                  gridTemplateColumns: "2fr 1fr 1fr 88px",
                  borderBottom: isLast ? "none" : "1px solid #444748",
                }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface text-xs font-semibold flex-shrink-0">
                    {getInitials(name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate leading-none">{u.name || "—"}</p>
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">{u.email}</p>
                  </div>
                </div>

                <div>
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                    style={{
                      background: u.role === "manager" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                      color: u.role === "manager" ? "#e5e2e1" : "#8e9192",
                      border: `1px solid ${u.role === "manager" ? "#8e9192" : "#444748"}`,
                    }}>
                    {u.role}
                  </span>
                </div>

                <div>
                  {teamMap[u.teamId] ? (
                    <span className="text-sm text-on-surface-variant">{teamMap[u.teamId]}</span>
                  ) : (
                    <span className="text-sm text-on-surface-variant/40">—</span>
                  )}
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={() => setEditUser(u)}
                    className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SlideOver open={!!editUser} onClose={() => setEditUser(null)} title="Edit user">
        {editUser && (
          <EditUserForm
            user={editUser} teams={teams}
            onClose={() => setEditUser(null)}
            onSaved={() => { setEditUser(null); load(); }}
          />
        )}
      </SlideOver>
    </div>
  );
}
