"use client";

import { useEffect, useState } from "react";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import type { User } from "@/types";
import ErrorMessage from "@/components/ui/ErrorMessage";

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .get("/users/me")
      .then((r) => setProfile(r.data))
      .catch((e) => setError(e.response?.data?.error ?? "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [user]);

  const display = profile ?? user;

  return (
    <ProtectedLayout>
      <div>
        <h1 className="text-2xl font-bold text-on-surface mb-1">My Profile</h1>
        <p className="text-sm text-on-surface-variant mb-8">
          Your account details from the organization directory.
        </p>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
          </div>
        )}
        {error && <ErrorMessage message={error} />}
        {!loading && display && (
          <div className="max-w-md bg-surface-container-low border border-outline-variant rounded-xl p-6 space-y-4">
            <Row label="Name" value={display.name ?? "-"} />
            <Row label="Email" value={display.email} />
            <Row label="Role" value={display.role === "admin" ? "manager" : display.role} />
            <Row label="Team" value={display.teamId || "Organization manager"} />
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{label}</span>
      <span className="text-sm text-on-surface capitalize">{value}</span>
    </div>
  );
}


