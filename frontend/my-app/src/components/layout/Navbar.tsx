"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { user, logout, isManager } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="text-lg font-bold text-indigo-600">
          Syncora
        </Link>
        <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
        <Link href="/projects"  className="text-sm text-gray-600 hover:text-gray-900">Projects</Link>
        <Link href="/tasks"     className="text-sm text-gray-600 hover:text-gray-900">Tasks</Link>
        {isManager && (
          <>
            <Link href="/teams" className="text-sm text-gray-600 hover:text-gray-900">Teams</Link>
            <Link href="/users" className="text-sm text-gray-600 hover:text-gray-900">Users</Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{user.email}</span>
        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full capitalize">
          {user.role}
        </span>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
