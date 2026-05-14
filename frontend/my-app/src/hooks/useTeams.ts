// Abdelrahman — use this hook in the teams page
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Team } from "@/types";

export function useTeams() {
  const [teams, setTeams]     = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.get("/teams")
      .then((r) => setTeams(r.data))
      .catch((e) => setError(e.response?.data?.error ?? "Failed to load teams"))
      .finally(() => setLoading(false));
  }, []);

  return { teams, loading, error, setTeams };
}
