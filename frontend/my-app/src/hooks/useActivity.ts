import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { ActivityLog } from "@/types";

export type { ActivityLog };

export function useActivity(taskId?: string, refreshKey = 0) {
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
  }, [taskId, refreshKey]);

  return { activity, loading, error };
}
