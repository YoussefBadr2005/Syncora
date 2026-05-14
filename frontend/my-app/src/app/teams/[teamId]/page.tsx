"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Team, User, Task, TaskStatus } from "@/types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  Todo: "To Do",
  InProgress: "In Progress",
  InReview: "In Review",
  Done: "Done",
};

const PRIORITY_DOT: Record<string, string> = {
  Critical: "#8b3535",
  High:     "#7a4a25",
  Medium:   "#7a6520",
  Low:      "#6b7280",
};

// ── Add Member Modal ──────────────────────────────────────────────────────────
function AddMemberModal({
  teamId,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  teamId: string;
  existingMemberIds: string[];
  onClose: () => void;
  onAdded: (u: User) => void;
}) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [adding, setAdding]     = useState<string | null>(null);
  const [error, setError]       = useState("");

  useEffect(() => {
    api.get("/users")
      .then(r => setAllUsers(r.data as User[]))
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  const eligible = allUsers.filter(u =>
    u.role === "employee" &&
    !existingMemberIds.includes(u.userId) &&
    (!search || (u.name ?? u.email).toLowerCase().includes(search.toLowerCase()))
  );

  const add = async (userId: string) => {
    setAdding(userId); setError("");
    try {
      await api.post(`/teams/${teamId}/members`, { userId });
      const user = allUsers.find(u => u.userId === userId)!;
      onAdded(user);
    } catch {
      setError("Failed to add member.");
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}>
      <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-sm"
           style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.5)" }}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant">
          <h2 className="text-sm font-semibold text-on-surface">Add member</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 border-b border-outline-variant">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
                 viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search employees…" autoFocus
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/50 focus:border-outline focus:ring-0 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-error text-center py-8">{error}</p>
          ) : eligible.length === 0 ? (
            <p className="text-sm text-on-surface-variant text-center py-8">No employees available</p>
          ) : (
            eligible.map(u => (
              <div key={u.userId} className="flex items-center gap-3 px-6 py-3 hover:bg-surface-container-high transition-colors">
                <div className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface text-xs font-semibold flex-shrink-0">
                  {(u.name || u.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{u.name || u.email}</p>
                  {u.name && <p className="text-xs text-on-surface-variant truncate">{u.email}</p>}
                </div>
                <button
                  onClick={() => add(u.userId)}
                  disabled={adding === u.userId}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface transition-colors disabled:opacity-50"
                >
                  {adding === u.userId ? "Adding…" : "Add"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-4 border-t border-outline-variant">
          <button type="button" onClick={onClose}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();
  const { user, isManager } = useAuth();

  const [team, setTeam]       = useState<Team | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get(`/teams/${teamId}`).then(r => setTeam(r.data as Team)),
      api.get("/users").then(r => {
        const all = r.data as User[];
        setMembers(all.filter(u => u.teamId === teamId && u.role === "employee"));
      }),
      api.get("/tasks").then(r => {
        const all = r.data as Task[];
        setTasks(all.filter(t => t.teamId === teamId));
      }),
    ])
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [user, teamId]);

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
        </div>
      </ProtectedLayout>
    );
  }

  if (notFound || !team) {
    return (
      <ProtectedLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-on-surface font-medium">Team not found.</p>
          <button onClick={() => router.push("/teams")}
            className="text-sm text-on-surface-variant hover:text-on-surface transition-colors">
            ← Back to Teams
          </button>
        </div>
      </ProtectedLayout>
    );
  }

  const tasksByStatus = (status: TaskStatus) => tasks.filter(t => t.status === status);
  const completedCount = tasksByStatus("Done").length;
  const totalCount = tasks.length;

  const memberMap = Object.fromEntries(members.map(m => [m.userId, m]));

  return (
    <ProtectedLayout>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-6">
        <Link href="/teams" className="hover:text-on-surface transition-colors">Teams</Link>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span className="text-on-surface">{team.name}</span>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center text-on-surface font-bold text-base">
            {initials(team.name)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-on-surface tracking-tight">{team.name}</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {members.length} member{members.length !== 1 ? "s" : ""} · Created {new Date(team.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        {isManager && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Member
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Members",   value: members.length },
          { label: "Total Tasks", value: totalCount },
          { label: "Completed", value: completedCount },
          { label: "Progress",  value: totalCount ? `${Math.round((completedCount / totalCount) * 100)}%` : "—" },
        ].map(s => (
          <div key={s.label} className="bg-surface-container rounded-xl border border-outline-variant px-5 py-4">
            <p className="text-xs text-on-surface-variant mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-on-surface">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Members column */}
        <div className="lg:col-span-1 bg-surface-container rounded-xl border border-outline-variant">
          <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
            <h2 className="text-sm font-semibold text-on-surface">Members</h2>
            <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">{members.length}</span>
          </div>
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              </svg>
              <p className="text-xs text-on-surface-variant">No members yet</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/50">
              {members.map(m => (
                <div key={m.userId} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-container-high/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface text-xs font-semibold flex-shrink-0">
                    {(m.name || m.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate leading-none">{m.name || m.email}</p>
                    {m.name && <p className="text-xs text-on-surface-variant truncate mt-0.5">{m.email}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tasks column */}
        <div className="lg:col-span-2 bg-surface-container rounded-xl border border-outline-variant">
          <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between">
            <h2 className="text-sm font-semibold text-on-surface">Tasks</h2>
            <span className="text-xs text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full">{totalCount}</span>
          </div>

          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <p className="text-xs text-on-surface-variant">No tasks for this team</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/50">
              {(["Todo", "InProgress", "InReview", "Done"] as TaskStatus[]).map(status => {
                const group = tasksByStatus(status);
                if (group.length === 0) return null;
                return (
                  <div key={status}>
                    <div className="px-5 py-2.5 bg-surface-container-high/40">
                      <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="ml-2 text-xs text-on-surface-variant/60">{group.length}</span>
                    </div>
                    {group.map(task => {
                      const assignee = task.assigneeId ? memberMap[task.assigneeId] : undefined;
                      return (
                        <Link key={task.taskId} href={`/tasks/${task.taskId}`}
                          className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-container-high/50 transition-colors group">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: PRIORITY_DOT[task.priority] ?? "#6b7280" }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-on-surface truncate group-hover:text-primary transition-colors">{task.title}</p>
                            {task.deadline && (
                              <p className="text-[10px] text-on-surface-variant mt-0.5">
                                Due {new Date(task.deadline).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          {assignee && (
                            <div className="w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant flex items-center justify-center text-on-surface text-[10px] font-semibold flex-shrink-0"
                                 title={assignee.name || assignee.email}>
                              {(assignee.name || assignee.email)[0].toUpperCase()}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddMemberModal
          teamId={teamId}
          existingMemberIds={members.map(m => m.userId)}
          onClose={() => setShowAdd(false)}
          onAdded={u => {
            setMembers(prev => [...prev, u]);
            setShowAdd(false);
          }}
        />
      )}
    </ProtectedLayout>
  );
}
