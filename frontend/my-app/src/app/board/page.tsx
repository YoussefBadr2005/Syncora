"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { Task, Project, Team, User } from "@/types";
import BoardFilters from "@/components/board/BoardFilters";
import KanbanBoard from "@/components/board/KanbanBoard";
import TaskPanel from "@/components/task/TaskPanel";
import { useProjectVisibility } from "@/lib/hooks/useProjectVisibility";

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
}

function todayKey() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function BoardPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const canScope = user?.role === "manager" || user?.role === "admin";
  const currentUserSub = canScope ? user?.userId : undefined;
  const { scope } = useProjectVisibility();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const teamParam = searchParams.get("team");

  // When this is set, render the TaskPanel slide-over over the board.
  const activeTaskId = searchParams.get("task");

  const [tasks, setTasks]       = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams]       = useState<Team[]>([]);
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);

  const [search, setSearch]                 = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [teamFilter, setTeamFilter]         = useState(teamParam ?? "All");
  const [projectFilter, setProjectFilter]   = useState(projectParam ?? "");
  const [dueToday, setDueToday]             = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    const isManager = user.role === "manager";
    Promise.all([
      api.get("/tasks").then(r => r.data as Task[]),
      api.get("/projects").then(r => r.data as Project[]),
      isManager ? api.get("/teams").then(r => r.data as Team[]) : Promise.resolve([] as Team[]),
      isManager ? api.get("/users").then(r => r.data as User[]) : Promise.resolve([] as User[]),
    ]).then(([t, p, tm, u]) => {
      setTasks(t.map(task => ({ ...task, status: normalizeStatus(task.status) as Task["status"] })));
      setProjects(p); setTeams(tm); setUsers(u);
    }).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const projectMap = Object.fromEntries(projects.map(p => [p.projectId, p.name]));
  const teamMap    = Object.fromEntries(teams.map(t => [t.teamId, t.name]));
  const getUserName = (id: string) => {
    const u = users.find(u => u.userId === id);
    return u?.name || u?.email?.split("@")[0] || id.slice(0, 6);
  };

  const today = todayKey();
  const filtered = tasks.filter(t => {
    if (priorityFilter !== "All" && t.priority !== priorityFilter)     return false;
    if (teamFilter !== "All"     && teamMap[t.teamId] !== teamFilter)   return false;
    if (projectFilter            && t.projectId !== projectFilter)      return false;
    if (dueToday) {
      if (!t.deadline || !t.deadline.startsWith(today))                 return false;
      if (normalizeStatus(t.status) === "Done")                        return false;
    }
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.description?.toLowerCase().includes(search.toLowerCase()))   return false;
    return true;
  });

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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface tracking-tight">Board</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {filtered.length}{tasks.length !== filtered.length ? ` of ${tasks.length}` : ""} task{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        {user?.role === "manager" && (
          <button type="button"
            onClick={() => router.push("/board?task=new", { scroll: false })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-surface-container-lowest hover:bg-primary/90 transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New task
          </button>
        )}
      </div>

      {/* Filter bar */}
      <BoardFilters
        search={search}
        onSearchChange={setSearch}
        teams={teams}
        teamFilter={teamFilter}
        onTeamChange={setTeamFilter}
        projects={projects}
        projectFilter={projectFilter}
        onProjectChange={setProjectFilter}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        dueToday={dueToday}
        onDueTodayChange={setDueToday}
        scope={scope}
        currentUserSub={currentUserSub}
      />

      {/* Empty state */}
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="11" rx="1"/><rect x="17" y="3" width="5" height="7" rx="1"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">No tasks yet</p>
            <p className="text-xs text-on-surface-variant mt-1">Tasks will show up here once they are created.</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-xl bg-surface-container border border-outline-variant flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#444748" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-on-surface">No tasks match your filters</p>
            <p className="text-xs text-on-surface-variant mt-1">Try adjusting or clearing your filters.</p>
          </div>
        </div>
      ) : (
        <KanbanBoard
          tasks={tasks}
          filtered={filtered}
          setTasks={setTasks}
          projectMap={projectMap}
          getUserName={getUserName}
        />
      )}

      {activeTaskId && (
        <TaskPanel
          task={activeTaskId}
          onClose={() => router.push("/board", { scroll: false })}
          onChanged={load}
        />
      )}
    </ProtectedLayout>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={null}>
      <BoardPageInner />
    </Suspense>
  );
}
