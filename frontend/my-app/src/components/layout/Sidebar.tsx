"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrg } from "@/hooks/useOrg";
import { NAV } from "./nav";

function NavIcon({ name }: { name: string }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "board":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case "projects":
      return (
        <svg {...common}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "overview":
      return (
        <svg {...common}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "manage":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V12a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const org = useOrg();
  const router = useRouter();
  const pathname = usePathname();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const canManage = user.role === "manager" || user.role === "admin";
  const items = NAV.filter((n) => !n.managerOnly || canManage);

  return (
    <aside className="flex flex-col h-dvh sticky top-0 w-[220px] flex-shrink-0 bg-surface-container-low border-r border-outline-variant overflow-y-auto">
      {/* Brand */}
      <div className="px-4 py-5">
        <Link href="/board" className="text-lg font-bold text-on-surface">
          Syncora
        </Link>
        {org?.name && (
          <p className="text-xs text-on-surface-variant mt-0.5 truncate" title={org.name}>
            {org.name}
          </p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-3">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-surface-container-high text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto px-3 py-4 border-t border-outline-variant flex flex-col gap-2">
        <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
        <span className="self-start px-2 py-0.5 rounded-full text-xs text-on-surface-variant capitalize bg-surface-container-high">
          {user.role}
        </span>
        <button
          onClick={handleLogout}
          className="mt-1 text-left text-sm text-on-surface-variant hover:text-error transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
