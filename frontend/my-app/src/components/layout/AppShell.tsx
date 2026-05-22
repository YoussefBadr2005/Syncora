"use client";

import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-6" style={{ maxWidth: 1440 }}>
        {children}
      </main>
    </div>
  );
}
