"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import api from "@/lib/api";
import type { Task, Team } from "@/types";

function normalizeStatus(s: string) {
  if (s === "Todo")       return "To Do";
  if (s === "InProgress") return "In Progress";
  if (s === "InReview")   return "In Review";
  return s;
}

const STATUS_CONFIG = {
  "To Do":       { dot: "#6b7280", text: "#8a8f96" },
  "In Progress": { dot: "#3d6b9e", text: "#5a8ab8" },
  "In Review":   { dot: "#8a6a1e", text: "#a88340" },
  "Done":        { dot: "#2d6e52", text: "#4a9070" },
} as const;

const COLUMNS = ["To Do", "In Progress", "In Review", "Done"] as const;

const ERROR_COLOR = "#b05555";

function Spinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
    </div>
  );
}

export default function OverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tasks, setTasks]   = useState<Task[]>([]);
  const [teams, setTeams]   = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const org = useOrg();

  const allowed = user?.role === "manager" || user?.role === "admin";

  // Role gate — bounce non-managers/admins to the board.
  useEffect(() => {
    if (!authLoading && user && !allowed) {
      router.replace("/board");
    }
  }, [authLoading, user, allowed, router]);

  const load = useCallback(() => {
    if (!user || !allowed) return;
    Promise.all([
      api.get("/tasks").then(r => r.data as Task[]),
      api.get("/teams").then(r => r.data as Team[]),
    ]).then(([t, tm]) => {
      setTasks(t);
      setTeams(tm);
    }).finally(() => setLoading(false));
  }, [user, allowed]);

  useEffect(() => { load(); }, [load]);

  // While auth resolves or the role gate is redirecting, show a spinner.
  if (authLoading || !user || !allowed) {
    return (
      <ProtectedLayout>
        <Spinner />
      </ProtectedLayout>
    );
  }

  if (loading) {
    return (
      <ProtectedLayout>
        <Spinner />
      </ProtectedLayout>
    );
  }

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  // ── Org-wide KPIs (mirrors the four CloudWatch metrics in the architecture doc) ──
  const totalTasks = tasks.length;
  const createdToday = tasks.filter(t => (t.createdAt ?? "").startsWith(todayKey)).length;
  const closedThisWeek = tasks.filter(t =>
    normalizeStatus(t.status) === "Done" &&
    t.updatedAt && new Date(t.updatedAt) >= weekAgo
  ).length;
  const overdueAll = tasks.filter(t =>
    t.deadline && normalizeStatus(t.status) !== "Done" && new Date(t.deadline) < now
  ).length;
  const closedTasks = tasks.filter(t => normalizeStatus(t.status) === "Done" && t.createdAt && t.updatedAt);
  const avgCloseDays = closedTasks.length === 0 ? null :
    closedTasks.reduce((acc, t) =>
      acc + (new Date(t.updatedAt as string).getTime() - new Date(t.createdAt as string).getTime()) / 86400000
    , 0) / closedTasks.length;

  return (
    <ProtectedLayout>
      {/* Page header */}
      <div className="mb-6">
        {org?.name && (
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
            {org.name}
          </p>
        )}
        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Overview</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Per-team status across the company
        </p>
      </div>

      {/* KPI strip (rubric metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Created today",   value: createdToday,                                hint: `${totalTasks} total` },
          { label: "Closed this week", value: closedThisWeek,                              hint: "Done in last 7d" },
          { label: "Avg days to close", value: avgCloseDays === null ? "—" : avgCloseDays.toFixed(1), hint: `${closedTasks.length} done` },
          { label: "Overdue",          value: overdueAll,                                  hint: "Past deadline · not Done", danger: overdueAll > 0 },
        ].map(kpi => (
          <div key={kpi.label} className="bg-surface-container rounded-xl border border-outline-variant p-4">
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{kpi.label}</p>
            <p className="text-2xl font-bold tabular-nums mt-1.5"
               style={{ color: kpi.danger ? ERROR_COLOR : "var(--color-on-surface, #e5e2e1)" }}>
              {kpi.value}
            </p>
            <p className="text-[11px] text-on-surface-variant mt-1">{kpi.hint}</p>
          </div>
        ))}
      </div>

      {teams.length === 0 ? (
        <EmptyState
          title="No teams yet"
          hint="Create teams in Manage to see per-team dashboards."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => {
            const teamTasks = tasks.filter(t => t.teamId === team.teamId);

            const counts: Record<string, number> = {
              "To Do": 0, "In Progress": 0, "In Review": 0, "Done": 0,
            };
            let overdue = 0;
            for (const t of teamTasks) {
              const status = normalizeStatus(t.status);
              if (status in counts) counts[status] += 1;
              if (
                t.deadline &&
                status !== "Done" &&
                new Date(t.deadline) < now
              ) {
                overdue += 1;
              }
            }
            const total = teamTasks.length;

            return (
              <Link
                key={team.teamId}
                href={`/board?team=${encodeURIComponent(team.name)}`}
                className="block bg-surface-container rounded-xl border border-outline-variant p-5 hover:border-outline transition-colors"
              >
                {/* Team name + total */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h2 className="text-sm font-semibold text-on-surface truncate">
                    {team.name}
                  </h2>
                  <div className="text-right flex-shrink-0">
                    <span className="text-2xl font-bold text-on-surface tabular-nums leading-none">
                      {total}
                    </span>
                    <p className="text-[10px] uppercase tracking-wider text-on-surface-variant mt-1">
                      task{total !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* Status breakdown */}
                <div className="space-y-2">
                  {COLUMNS.map(col => {
                    const cfg = STATUS_CONFIG[col];
                    return (
                      <div key={col} className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: cfg.dot }}
                          />
                          <span style={{ color: cfg.text }}>{col}</span>
                        </span>
                        <span className="tabular-nums text-on-surface-variant">
                          {counts[col]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Overdue figure */}
                <div className="mt-4 pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs">
                  <span className="text-on-surface-variant">Overdue</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: overdue > 0 ? ERROR_COLOR : undefined }}
                  >
                    {overdue}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ProtectedLayout>
  );
}
