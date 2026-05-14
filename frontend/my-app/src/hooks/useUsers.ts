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

  const inviteUser = async (email: string, role: "manager" | "employee", teamId: string) => {
    try {
      const res = await api.post("/users", { email, role, teamId });
      setUsers([...users, res.data]);
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.error ?? "Failed to invite user";
      setError(msg);
      throw err;
    }
  };

  const updateUser = async (userId: string, updates: Partial<User>) => {
    try {
      const res = await api.put(`/users/${userId}`, updates);
      setUsers(users.map((u) => (u.userId === userId ? res.data : u)));
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.error ?? "Failed to update user";
      setError(msg);
      throw err;
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      await api.delete(`/users/${userId}`);
      setUsers(users.filter((u) => u.userId !== userId));
    } catch (err: any) {
      const msg = err.response?.data?.error ?? "Failed to delete user";
      setError(msg);
      throw err;
    }
  };

  return { users, loading, error, setUsers, inviteUser, updateUser, deleteUser };
}
