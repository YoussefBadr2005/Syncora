"use client";
import { useEffect, useState } from "react";

export type ProjectScope = "all" | "mine";

const KEY = "syncora.projectScope";

export function useProjectVisibility() {
  const [scope, setScope] = useState<ProjectScope>("all");

  useEffect(() => {
    const v = localStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v === "all" || v === "mine") setScope(v);
  }, []);

  const update = (s: ProjectScope) => {
    setScope(s);
    localStorage.setItem(KEY, s);
  };

  return { scope, setScope: update };
}

// Filter helper (pure — verify by inspection):
// projects.filter(p => scope === "all" || p.createdBy === currentUserSub)
export function scopeProjects<T extends { createdBy?: string }>(
  projects: T[],
  scope: ProjectScope,
  currentUserSub: string | undefined
): T[] {
  if (scope === "all" || !currentUserSub) return projects;
  return projects.filter((p) => p.createdBy === currentUserSub);
}
