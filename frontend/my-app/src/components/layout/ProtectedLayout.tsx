"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";

const C = {
  primary: "#232F3E",
  accent:  "#FF9900",
  blue:    "#0073BB",
  neutral: "#64748B",
  bg:      "#F4F6F9",
};

const MANAGER_NAV = [
  {
    href: "/dashboard", label: "Dashboard",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    href: "/tasks", label: "Tasks",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
  },
  {
    href: "/projects", label: "Projects",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    href: "/teams", label: "Teams",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
    ),
  },
  {
    href: "/users", label: "Users",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
];

const EMPLOYEE_NAV = [
  {
    href: "/dashboard", label: "Dashboard",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    href: "/tasks", label: "My Tasks",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
  },
  {
    href: "/projects", label: "Projects",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
    ),
  },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent"
             style={{ borderTopColor: C.accent, borderRightColor: C.accent + "40" }} />
      </div>
    );
  }

  const isManager  = user.role === "manager";
  const NAV        = isManager ? MANAGER_NAV : EMPLOYEE_NAV;
  const initials   = (user.name ?? user.email).charAt(0).toUpperCase();
  const displayName = user.name ?? user.email.split("@")[0];

  // Derive page label from pathname
  const segment = pathname.split("/")[1];
  const PAGE_LABELS: Record<string, string> = {
    dashboard: "Dashboard", tasks: "Tasks", projects: "Projects",
    teams: "Teams", users: "Users", profile: "Profile",
  };
  const pageLabel = PAGE_LABELS[segment] ?? segment ?? "Dashboard";

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: C.bg }}>

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-shrink-0 flex flex-col h-screen sticky top-0"
             style={{ background: C.primary }}>

        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3">
          <img src="/logo.png" alt="Syncora" className="h-8 w-auto object-contain" />
          <div>
            <p className="text-sm font-bold text-white tracking-wide">Syncora</p>
            <p className="text-xs capitalize" style={{ color: C.neutral + "cc" }}>
              {isManager ? "Manager Portal" : "Team Portal"}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 mb-3" style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(item => {
            const active = pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={active ? {
                  background: C.accent,
                  color: C.primary,
                  fontWeight: 600,
                } : {
                  color: "rgba(255,255,255,0.6)",
                }
                }
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLAnchorElement).style.color = "white"; }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.6)"; } }}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {item.label}
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: C.primary, opacity: 0.5 }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Manager quick-action */}
        {isManager && (
          <div className="px-4 pb-4">
            <div className="mx-0 mb-3" style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
            <Link href="/tasks/new"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
              style={{ background: C.accent, color: C.primary }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create Task
            </Link>
          </div>
        )}

        {/* User strip */}
        <div className="px-4 pb-5">
          <div className="mb-3" style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
               style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                 style={{ background: C.accent, color: C.primary }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{displayName}</p>
              <p className="text-xs capitalize" style={{ color: "rgba(255,255,255,0.45)" }}>{user.role}</p>
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.accent; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,153,0,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="bg-white border-b flex items-center justify-between px-6 py-0"
                style={{ borderColor: "#E8ECF0", height: 56 }}>

          {/* Left — breadcrumb */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: C.neutral }}>Syncora</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            <span className="text-sm font-semibold" style={{ color: C.primary }}>{pageLabel}</span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">

            {/* Notification bell */}
            <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100 relative"
                    style={{ color: C.neutral }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
            </button>

            {/* Divider */}
            <div className="w-px h-5 mx-1" style={{ background: "#E8ECF0" }} />

            {/* Profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl transition-colors hover:bg-gray-50"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                     style={{ background: C.primary }}>
                  {initials}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold leading-tight" style={{ color: C.primary }}>{displayName}</p>
                  <p className="text-xs capitalize leading-tight" style={{ color: C.neutral }}>{user.role}</p>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.neutral}
                     strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                     className={`transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl z-50 overflow-hidden"
                     style={{ border: "1.5px solid #E8ECF0", boxShadow: "0 8px 24px rgba(0,0,0,0.10)" }}>
                  {/* User info header */}
                  <div className="px-4 py-3.5" style={{ background: C.primary }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                           style={{ background: C.accent, color: C.primary }}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                        <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{user.email}</p>
                      </div>
                    </div>
                    <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                          style={{ background: C.accent + "25", color: C.accent }}>
                      {user.role}
                    </span>
                  </div>

                  {/* Menu items */}
                  <div className="py-1.5">
                    <Link href="/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-gray-50"
                      style={{ color: C.primary }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.neutral} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                      <span className="font-medium">My Profile</span>
                    </Link>

                    <div className="mx-4 my-1" style={{ height: 1, background: "#F1F5F9" }} />

                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
                      style={{ color: C.neutral }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
