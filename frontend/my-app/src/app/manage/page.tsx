"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useAuth } from "@/hooks/useAuth";
import TeamsTab from "@/components/manage/TeamsTab";
import UsersTab from "@/components/manage/UsersTab";

type Tab = "teams" | "users";

export default function ManagePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("teams");

  const allowed = user?.role === "manager" || user?.role === "admin";

  useEffect(() => {
    if (!loading && user && !allowed) {
      router.replace("/board");
    }
  }, [loading, user, allowed, router]);

  if (loading || !user || !allowed) {
    return (
      <ProtectedLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
        </div>
      </ProtectedLayout>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "teams", label: "Teams" },
    { id: "users", label: "Users" },
  ];

  return (
    <ProtectedLayout>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Manage</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Create teams and assign users to teams.
        </p>
      </div>

      {/* Tab switcher (segmented control) */}
      <div className="inline-flex items-center gap-1 p-1 mb-6 rounded-lg bg-surface-container border border-outline-variant">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-surface-container-high text-on-surface"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "teams" ? <TeamsTab /> : <UsersTab />}
    </ProtectedLayout>
  );
}
