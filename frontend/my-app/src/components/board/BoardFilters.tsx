"use client";

import { useEffect, useRef, useState } from "react";
import type { Project, Team } from "@/types";
import { scopeProjects, type ProjectScope } from "@/lib/hooks/useProjectVisibility";

const PRIORITIES = ["All", "Critical", "High", "Medium", "Low"];

// ── Dropdown filter (copied from the original board for visual consistency) ─────
function FilterDropdown({ options, value, onChange, label }: {
  options: string[]; value: string; onChange: (v: string) => void; label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const active = value !== options[0];

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border"
        style={{
          background: active ? "rgba(255,255,255,0.06)" : "transparent",
          borderColor: active ? "#8e9192" : "#444748",
          color: active ? "#e5e2e1" : "#8e9192",
        }}>
        <span style={{ fontSize: 13 }}>{active ? value : label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1.5 z-50 overflow-hidden"
          style={{
            minWidth: 176,
            background: "#1c1b1b",
            border: "1px solid #444748",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
          }}>
          <div className="p-1">
            {options.map(o => {
              const selected = o === value;
              return (
                <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
                  className="w-full text-left flex items-center gap-2.5 transition-colors"
                  style={{
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: 13,
                    background: selected ? "rgba(255,255,255,0.07)" : "transparent",
                    color: selected ? "#e5e2e1" : "#8e9192",
                    fontWeight: selected ? 500 : 400,
                  }}
                  onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLButtonElement).style.color = "#e5e2e1"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = selected ? "rgba(255,255,255,0.07)" : "transparent"; (e.currentTarget as HTMLButtonElement).style.color = selected ? "#e5e2e1" : "#8e9192"; }}
                >
                  <span
                    className="flex-shrink-0"
                    style={{
                      width: 3,
                      height: 14,
                      borderRadius: 9999,
                      background: selected ? "#ffffff" : "transparent",
                    }}
                  />
                  <span className="flex-1 truncate">{o}</span>
                  {selected && (
                    <svg className="flex-shrink-0" width="11" height="11" viewBox="0 0 24 24" fill="none"
                         stroke="#e5e2e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BoardFilters({
  search,
  onSearchChange,
  teams,
  teamFilter,
  onTeamChange,
  projects,
  projectFilter,
  onProjectChange,
  priorityFilter,
  onPriorityChange,
  dueToday,
  onDueTodayChange,
  scope = "all",
  currentUserSub,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  teams: Team[];
  teamFilter: string;
  onTeamChange: (v: string) => void;
  projects: Project[];
  /** project filter holds a projectId, or "" for All */
  projectFilter: string;
  onProjectChange: (projectId: string) => void;
  priorityFilter: string;
  onPriorityChange: (v: string) => void;
  dueToday: boolean;
  onDueTodayChange: (v: boolean) => void;
  scope?: ProjectScope;
  currentUserSub?: string;
}) {
  // Project dropdown works on labels; map back to projectId on change.
  // Apply scope filter so only visible projects appear in the dropdown.
  const visibleProjects = scopeProjects(projects, scope, currentUserSub);
  const projectOptions = ["All", ...visibleProjects.map(p => p.name)];
  const activeProjectName = visibleProjects.find(p => p.projectId === projectFilter)?.name ?? "All";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
             viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="text" placeholder="Search tasks…" value={search} onChange={e => onSearchChange(e.target.value)}
          className="pl-9 pr-4 py-2 text-sm rounded-lg bg-surface-container border border-outline-variant text-on-surface placeholder:text-on-surface-variant/60 focus:border-outline focus:ring-0 focus:outline-none transition-colors"
          style={{ width: 220 }} />
      </div>

      {teams.length > 0 && (
        <FilterDropdown options={["All", ...teams.map(t => t.name)]} value={teamFilter} onChange={onTeamChange} label="Team" />
      )}

      {visibleProjects.length > 0 && (
        <FilterDropdown
          options={projectOptions}
          value={activeProjectName}
          onChange={name => {
            if (name === "All") { onProjectChange(""); return; }
            const proj = visibleProjects.find(p => p.name === name);
            onProjectChange(proj?.projectId ?? "");
          }}
          label="Project"
        />
      )}

      <FilterDropdown options={PRIORITIES} value={priorityFilter} onChange={onPriorityChange} label="Priority" />

      {/* Due today toggle chip */}
      <button
        type="button"
        onClick={() => onDueTodayChange(!dueToday)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border"
        style={{
          background: dueToday ? "rgba(255,255,255,0.06)" : "transparent",
          borderColor: dueToday ? "#8e9192" : "#444748",
          color: dueToday ? "#e5e2e1" : "#8e9192",
        }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span style={{ fontSize: 13 }}>Due today</span>
      </button>
    </div>
  );
}
