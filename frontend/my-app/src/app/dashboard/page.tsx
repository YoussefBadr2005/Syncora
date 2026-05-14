"use client";

import { useEffect, useState } from "react";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Task, Team, User, Project } from "@/types";
import Link from "next/link";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOverdue(task: Task) {
  return task.deadline && task.status !== "Done" && new Date(task.deadline) < new Date();
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  "To Do":       "#64748B",
  "In Progress": "#0073BB",
  "In Review":   "#FF9900",
  "Done":        "#22C55E",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "#EF4444",
  High:     "#F97316",
  Medium:   "#FF9900",
  Low:      "#64748B",
};

const BAR_COLORS = ["#232F3E", "#0073BB", "#FF9900", "#22C55E", "#A855F7"];

// ─── Shared components ────────────────────────────────────────────────────────
function StatCard({ label, value, accent, sub }: {
  label: string; value: string | number; accent?: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color: accent ?? "#232F3E" }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function TaskRow({ task, userName }: { task: Task; userName: (id: string) => string }) {
  return (
    <Link href={`/tasks/${task.taskId}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[task.status] }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
        <p className="text-xs text-gray-400">
          {task.status}
          {task.deadline && ` · due ${new Date(task.deadline).toLocaleDateString()}`}
          {task.assigneeId && ` · ${userName(task.assigneeId)}`}
        </p>
      </div>
      <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: PRIORITY_COLORS[task.priority] + "20", color: PRIORITY_COLORS[task.priority] }}>
        {task.priority}
      </span>
    </Link>
  );
}

// ─── Manager Dashboard ────────────────────────────────────────────────────────
function ManagerDashboard({ tasks, teams, users, projects, activity }: {
  tasks: Task[]; teams: Team[]; users: User[];
  projects: Project[]; activity: Record<string, unknown>[];
}) {
  const today     = new Date().toISOString().split("T")[0];
  const active    = tasks.filter(t => t.status !== "Done");
  const overdue   = tasks.filter(t => isOverdue(t));
  const doneToday = tasks.filter(t => t.status === "Done" && t.updatedAt?.startsWith(today));

  const avgClose = (() => {
    const closed = tasks.filter(t => t.status === "Done" && t.createdAt && t.updatedAt);
    if (!closed.length) return "—";
    const avg = closed.reduce((s, t) =>
      s + (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()), 0) / closed.length;
    return (avg / 86400000).toFixed(1) + "d";
  })();

  const statusCounts = ["To Do", "In Progress", "In Review", "Done"].map(s => ({
    status: s, count: tasks.filter(t => t.status === s).length,
  }));

  const teamRows = teams.map((team, i) => {
    const tt   = tasks.filter(t => t.teamId === team.teamId);
    const done = tt.filter(t => t.status === "Done").length;
    const ov   = tt.filter(t => isOverdue(t)).length;
    const pct  = tt.length ? Math.round((done / tt.length) * 100) : 0;
    return { team, total: tt.length, done, overdue: ov, pct, color: BAR_COLORS[i % BAR_COLORS.length] };
  });

  const userName = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u?.name || u?.email?.split("@")[0] || id.slice(0, 8);
  };

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Active Tasks"    value={active.length} />
        <StatCard label="Overdue"         value={overdue.length} accent={overdue.length > 0 ? "#EF4444" : undefined} />
        <StatCard label="Completed Today" value={doneToday.length} accent={doneToday.length > 0 ? "#22C55E" : undefined} />
        <StatCard label="Avg Close Time"  value={avgClose} />
        <StatCard label="Projects"        value={projects.length} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left col */}
        <div className="col-span-2 space-y-6">

          {/* Overdue alert */}
          {overdue.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-red-500">⚠</span> Overdue Tasks ({overdue.length})
              </h2>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {overdue.map(t => (
                  <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-red-100 hover:border-red-300 transition-colors"
                    style={{ background: "#FEF2F2" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-800 truncate">{t.title}</span>
                      {t.assigneeId && <span className="text-xs text-gray-400 flex-shrink-0">→ {userName(t.assigneeId)}</span>}
                    </div>
                    <span className="text-xs text-red-500 flex-shrink-0 ml-3">
                      {t.deadline ? new Date(t.deadline).toLocaleDateString() : "No deadline"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Status breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Tasks by Status</h2>
            <div className="grid grid-cols-4 gap-3">
              {statusCounts.map(({ status, count }) => (
                <Link key={status} href={`/tasks?status=${encodeURIComponent(status)}`}
                  className="rounded-lg p-4 text-center hover:opacity-90 transition-opacity"
                  style={{ background: STATUS_COLORS[status] + "15", border: `1px solid ${STATUS_COLORS[status]}30` }}>
                  <p className="text-2xl font-bold" style={{ color: STATUS_COLORS[status] }}>{count}</p>
                  <p className="text-xs font-medium text-gray-500 mt-1">{status}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* Team performance */}
          {teamRows.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-4">Team Performance</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th className="pb-2 font-medium">Team</th>
                    <th className="pb-2 font-medium text-center">Tasks</th>
                    <th className="pb-2 font-medium text-center">Done</th>
                    <th className="pb-2 font-medium text-center text-red-400">Overdue</th>
                    <th className="pb-2 font-medium">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {teamRows.map(r => (
                    <tr key={r.team.teamId} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 font-medium text-gray-800">{r.team.name}</td>
                      <td className="py-3 text-center text-gray-500">{r.total}</td>
                      <td className="py-3 text-center text-green-600 font-medium">{r.done}</td>
                      <td className="py-3 text-center">
                        <span className={r.overdue > 0 ? "text-red-500 font-semibold" : "text-gray-300"}>{r.overdue}</span>
                      </td>
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
                          </div>
                          <span className="text-xs text-gray-400 w-8 text-right">{r.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Projects</h2>
                <Link href="/projects" className="text-xs font-medium" style={{ color: "#0073BB" }}>View all</Link>
              </div>
              <div className="space-y-2">
                {projects.slice(0, 5).map(p => {
                  const pt  = tasks.filter(t => t.projectId === p.projectId);
                  const pct = pt.length ? Math.round((pt.filter(t => t.status === "Done").length / pt.length) * 100) : 0;
                  return (
                    <div key={p.projectId} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{pt.length} task{pt.length !== 1 ? "s" : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#0073BB" }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right col */}
        <div className="space-y-6">
          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Recent Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-400">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {activity.slice(0, 8).map((a, i) => {
                  const payload = (a.payload ?? {}) as Record<string, string>;
                  const who = userName(payload.assigneeId ?? "");
                  return (
                    <div key={(a.logId as string) ?? i} className="flex gap-3 items-start">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                           style={{ background: "#0073BB" }}>
                        {who.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">
                        <span className="font-semibold text-gray-800">{who}</span>{" "}
                        {a.type === "assignment"
                          ? <><span>was assigned </span><Link href={`/tasks/${a.taskId}`} className="font-mono text-blue-600 hover:underline">{(a.taskId as string).slice(0, 7).toUpperCase()}</Link></>
                          : <><span>moved task to </span><span className="font-medium" style={{ color: STATUS_COLORS[payload.toStatus] ?? "#232F3E" }}>{payload.toStatus}</span></>
                        }
                        <span className="block text-gray-400 mt-0.5">{timeAgo(a.createdAt as string)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Priority breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Tasks by Priority</h2>
            {(["Critical", "High", "Medium", "Low"] as const).map(p => {
              const count = tasks.filter(t => t.priority === p && t.status !== "Done").length;
              return (
                <div key={p} className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs font-medium w-14 text-gray-500">{p}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: tasks.length ? `${(count / tasks.length) * 100}%` : "0%", background: PRIORITY_COLORS[p] }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-600 w-4 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Employee Dashboard ───────────────────────────────────────────────────────
function EmployeeDashboard({ tasks, projects, activity, userId }: {
  tasks: Task[]; projects: Project[];
  activity: Record<string, unknown>[]; userId: string;
}) {
  const myTasks    = tasks.filter(t => t.assigneeId === userId);
  const myActive   = myTasks.filter(t => t.status !== "Done");
  const myOverdue  = myTasks.filter(t => isOverdue(t));
  const today      = new Date().toISOString().split("T")[0];
  const myDoneToday = myTasks.filter(t => t.status === "Done" && t.updatedAt?.startsWith(today));

  const myActivity = activity.filter(a => {
    const payload = (a.payload ?? {}) as Record<string, string>;
    return payload.assigneeId === userId;
  });

  const statusCounts = ["To Do", "In Progress", "In Review", "Done"].map(s => ({
    status: s, count: myTasks.filter(t => t.status === s).length,
  }));

  return (
    <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="My Active Tasks"  value={myActive.length} />
        <StatCard label="Overdue"          value={myOverdue.length} accent={myOverdue.length > 0 ? "#EF4444" : undefined} />
        <StatCard label="Done Today"       value={myDoneToday.length} accent={myDoneToday.length > 0 ? "#22C55E" : undefined} />
        <StatCard label="Total Assigned"   value={myTasks.length} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left col */}
        <div className="col-span-2 space-y-6">

          {/* Overdue warning */}
          {myOverdue.length > 0 && (
            <div className="bg-white rounded-xl border border-red-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-red-500">⚠</span> Your Overdue Tasks
              </h2>
              <div className="space-y-2">
                {myOverdue.map(t => (
                  <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-red-100 hover:border-red-300 transition-colors"
                    style={{ background: "#FEF2F2" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-800 truncate">{t.title}</span>
                    </div>
                    <span className="text-xs text-red-500 ml-3 flex-shrink-0">
                      {t.deadline ? new Date(t.deadline).toLocaleDateString() : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* My tasks by status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">My Tasks by Status</h2>
            <div className="grid grid-cols-4 gap-3 mb-5">
              {statusCounts.map(({ status, count }) => (
                <div key={status} className="rounded-lg p-4 text-center"
                     style={{ background: STATUS_COLORS[status] + "15", border: `1px solid ${STATUS_COLORS[status]}30` }}>
                  <p className="text-2xl font-bold" style={{ color: STATUS_COLORS[status] }}>{count}</p>
                  <p className="text-xs font-medium text-gray-500 mt-1">{status}</p>
                </div>
              ))}
            </div>

            {/* Active task list */}
            {myActive.length === 0 ? (
              <p className="text-sm text-gray-400">No active tasks. 🎉</p>
            ) : (
              <div className="space-y-2">
                {myActive.map(t => (
                  <TaskRow key={t.taskId} task={t} userName={() => ""} />
                ))}
              </div>
            )}
          </div>

          {/* Team projects */}
          {projects.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-800">Team Projects</h2>
                <Link href="/projects" className="text-xs font-medium" style={{ color: "#0073BB" }}>View all</Link>
              </div>
              <div className="space-y-2">
                {projects.map(p => {
                  const pt    = tasks.filter(t => t.projectId === p.projectId);
                  const myPt  = myTasks.filter(t => t.projectId === p.projectId);
                  const pct   = pt.length ? Math.round((pt.filter(t => t.status === "Done").length / pt.length) * 100) : 0;
                  return (
                    <div key={p.projectId} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{myPt.length} of {pt.length} assigned to you</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#0073BB" }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right col */}
        <div className="space-y-6">
          {/* Next deadlines */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Upcoming Deadlines</h2>
            {(() => {
              const upcoming = myActive
                .filter(t => t.deadline)
                .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
                .slice(0, 5);
              return upcoming.length === 0 ? (
                <p className="text-sm text-gray-400">No upcoming deadlines.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map(t => {
                    const daysLeft = Math.ceil((new Date(t.deadline!).getTime() - Date.now()) / 86400000);
                    return (
                      <Link key={t.taskId} href={`/tasks/${t.taskId}`}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 border border-gray-100 transition-colors">
                        <span className="text-sm font-medium text-gray-800 truncate">{t.title}</span>
                        <span className={`text-xs font-semibold ml-2 flex-shrink-0 ${daysLeft <= 1 ? "text-red-500" : daysLeft <= 3 ? "text-orange-500" : "text-gray-400"}`}>
                          {daysLeft <= 0 ? "today" : `${daysLeft}d`}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* My activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">My Activity</h2>
            {myActivity.length === 0 ? (
              <p className="text-sm text-gray-400">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {myActivity.slice(0, 6).map((a, i) => {
                  const payload = (a.payload ?? {}) as Record<string, string>;
                  return (
                    <div key={(a.logId as string) ?? i} className="flex gap-2 items-start">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-blue-400" />
                      <div className="text-xs text-gray-600">
                        {a.type === "assignment"
                          ? <><span className="font-medium">Assigned</span> to task <Link href={`/tasks/${a.taskId}`} className="font-mono text-blue-600 hover:underline">{(a.taskId as string).slice(0, 7).toUpperCase()}</Link></>
                          : <><span className="font-medium">Moved</span> task to <span className="font-medium" style={{ color: STATUS_COLORS[payload.toStatus] ?? "#232F3E" }}>{payload.toStatus}</span></>
                        }
                        <span className="block text-gray-400 mt-0.5">{timeAgo(a.createdAt as string)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Priority breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">My Tasks by Priority</h2>
            {(["Critical", "High", "Medium", "Low"] as const).map(p => {
              const count = myActive.filter(t => t.priority === p).length;
              return (
                <div key={p} className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs font-medium w-14 text-gray-500">{p}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: myActive.length ? `${(count / myActive.length) * 100}%` : "0%", background: PRIORITY_COLORS[p] }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-600 w-4 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [users,    setUsers]    = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<Record<string, unknown>[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    if (!user) return;
    const isManager = user.role === "manager";
    Promise.all([
      api.get("/tasks").then(r => r.data as Task[]),
      api.get("/projects").then(r => r.data as Project[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
      api.get("/activity").then(r => r.data).catch(() => []),
    ]).then(([t, p, tm, u, a]) => {
      setTasks(t); setProjects(p); setTeams(tm); setUsers(u);
      setActivity(Array.isArray(a) ? a : []);
    }).finally(() => setLoading(false));
  }, [user]);

  const searchResults = search.length > 1
    ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#FF9900" }} />
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.name || user?.email?.split("@")[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="15" height="15"
               viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" placeholder="Search tasks..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-56 pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:border-blue-400" />
          {searchResults.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
              {searchResults.map(t => (
                <Link key={t.taskId} href={`/tasks/${t.taskId}`} onClick={() => setSearch("")}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0 first:rounded-t-xl last:rounded-b-xl">
                  <span className="font-medium text-gray-800 truncate">{t.title}</span>
                  <span className="ml-3 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{ background: STATUS_COLORS[t.status] + "20", color: STATUS_COLORS[t.status] }}>
                    {t.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Role-based dashboard */}
      {user?.role === "manager" ? (
        <ManagerDashboard tasks={tasks} teams={teams} users={users} projects={projects} activity={activity} />
      ) : (
        <EmployeeDashboard tasks={tasks} projects={projects} activity={activity} userId={user?.userId ?? ""} />
      )}
    </ProtectedLayout>
  );
}
