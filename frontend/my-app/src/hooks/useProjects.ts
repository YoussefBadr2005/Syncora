// Abdelrahman — use this hook in the projects page
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Project } from "@/types";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    api.get("/projects")
      .then((r) => setProjects(r.data))
      .catch((e) => setError(e.response?.data?.error ?? "Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  return { projects, loading, error, setProjects };
}
