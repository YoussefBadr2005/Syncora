import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Task } from "@/types";

interface DigestResponse {
  date: string;
  total: number;
  byAssignee: Record<string, Task[]>;
}

export function useDigest() {
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/tasks/digest/today")
      .then((r) => setDigest(r.data))
      .catch((e) => setError(e.response?.data?.error ?? "Failed to load digest"))
      .finally(() => setLoading(false));
  }, []);

  return { digest, loading, error };
}
