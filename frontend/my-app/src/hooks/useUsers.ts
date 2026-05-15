import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { User } from "@/types";

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/users")
      .then((r) => setUsers(r.data))
      .catch((e) => setError(e.response?.data?.error ?? "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  const inviteUser = async (
    email: string,
    role: "manager" | "employee",
    teamId: string
  ) => {
    try {
      const res = await api.post("/users", { email, role, teamId });
      setUsers((prev) => [...prev, res.data]);
      return res.data as User;
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Failed to invite user");
      throw err;
    }
  };

  const updateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const res = await api.put(`/users/${userId}`, updates);
      setUsers((prev) => prev.map((u) => (u.userId === userId ? res.data : u)));
      return res.data as User;
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Failed to update user");
      throw err;
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await api.delete(`/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Failed to delete user");
      throw err;
    }
  };

  return { users, loading, error, setUsers, inviteUser, updateUser, deleteUser };
}
