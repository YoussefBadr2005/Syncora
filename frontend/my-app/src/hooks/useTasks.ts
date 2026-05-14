// Mostafa — use this hook in the task board
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Task } from "@/types";

export function useTasks(projectId?: string) {
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const params = projectId ? { projectId } : {};
    api.get("/tasks", { params })
      .then((r) => setTasks(r.data))
      .catch((e) => setError(e.response?.data?.error ?? "Failed to load tasks"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const updateStatus = async (taskId: string, status: Task["status"]) => {
    await api.put(`/tasks/${taskId}`, { status });
    setTasks((prev) =>
      prev.map((t) => (t.taskId === taskId ? { ...t, status } : t))
    );
  };

  return { tasks, loading, error, updateStatus, setTasks };
}
