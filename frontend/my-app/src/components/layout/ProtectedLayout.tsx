"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import NotificationBell from "./NotificationBell";

const MANAGER_NAV = [
  { href: "/dashboard",  label: "Dashboard"  },
  { href: "/projects",   label: "Projects"   },
  { href: "/teams",      label: "Teams"      },
  { href: "/tasks",      label: "Tasks"      },
  { href: "/users",      label: "Employees"  },
  { href: "/digest",     label: "Digest"     },
];

const EMPLOYEE_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects",  label: "Projects"  },
  { href: "/teams",     label: "Teams"     },
  { href: "/tasks",     label: "My Tasks"  },
  { href: "/digest",    label: "Digest"    },
];

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isManager } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!profileOpen) return;
    const h = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [profileOpen]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-container-lowest">
        <div className="w-8 h-8 rounded-full border-2 border-surface-variant border-t-primary animate-spin" />
      </div>
    );
  }

  const NAV         = isManager ? MANAGER_NAV : EMPLOYEE_NAV;
  const initials    = (user.name ?? user.email).charAt(0).toUpperCase();
  const displayName = user.name ?? user.email.split("@")[0];

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface antialiased"
         style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ── Top navigation bar ── */}
      <header className="sticky top-0 z-50 border-b border-outline-variant bg-surface/80 backdrop-blur-md">
        <div className="flex items-center justify-between h-16 px-8 max-w-[1440px] mx-auto">

          {/* Brand + nav links */}
          <div className="flex items-center gap-8">
            <span className="text-primary font-bold" style={{ fontSize: 20, letterSpacing: "-0.01em" }}>
              Syncora
            </span>
            <nav className="hidden md:flex items-center gap-6">
              {NAV.map(item => {
                const active = pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}
                    className="transition-colors whitespace-nowrap"
                    style={{
                      fontSize: 13, fontWeight: active ? 600 : 400,
                      color: active ? "#e5e2e1" : "#8e9192",
                      borderBottom: active ? "2px solid #ffffff" : "2px solid transparent",
                      paddingBottom: 4,
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#c4c7c8"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#8e9192"; }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Trailing actions */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative hidden sm:block">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="13" height="13"
                   viewBox="0 0 24 24" fill="none" stroke="#8e9192" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Search..."
                className="bg-surface-container text-on-surface pl-9 pr-4 py-1.5 rounded-full border border-outline-variant focus:border-outline focus:ring-0 focus:outline-none transition-all placeholder:text-on-surface-variant/60"
                style={{ fontSize: 14, width: 192 }}
              />
            </div>

            <NotificationBell />

            {/* Settings */}
            <button className="p-2 rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>

            {/* Avatar / profile dropdown */}
            <div className="relative ml-1" ref={profileRef}>
              <button onClick={() => setProfileOpen(o => !o)}
                className="w-8 h-8 rounded-full border border-outline-variant hover:border-primary transition-colors overflow-hidden flex items-center justify-center bg-surface-container-high text-on-surface font-bold text-sm cursor-pointer"
              >
                {initials}
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-surface-container-low border border-outline-variant rounded-lg overflow-hidden z-50"
                     style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-outline-variant">
                    <p className="text-on-surface font-semibold text-sm truncate">{displayName}</p>
                    <p className="text-on-surface-variant truncate" style={{ fontSize: 12 }}>{user.email}</p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-on-surface-variant capitalize"
                          style={{ fontSize: 11, fontWeight: 600, background: "#353434" }}>
                      {user.role}
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="py-1">
                    <Link href="/profile" onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-on-surface hover:bg-surface-container-high transition-colors"
                      style={{ fontSize: 13 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                      My Profile
                    </Link>
                    <div className="mx-4 my-1 border-t border-outline-variant" />
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                      style={{ fontSize: 13 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
