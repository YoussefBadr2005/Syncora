"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "./AppShell";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest">
        <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
