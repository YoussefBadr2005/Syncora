import { useEffect, useState } from "react";
import api from "@/lib/api";

export interface ActivityLog {
  logId: string;
  taskId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function useActivity(taskId?: string) {
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = taskId ? `/activity?taskId=${taskId}` : "/activity?limit=20";
    api
      .get(url)
      .then((r) => setActivity(r.data))
      .catch((e) => setError(e.response?.data?.error ?? "Failed to load activity"))
      .finally(() => setLoading(false));
  }, [taskId]);

  return { activity, loading, error };
}
