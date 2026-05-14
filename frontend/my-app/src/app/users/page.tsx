// OWNER: Yassin — User management (manager only)
"use client";

import ProtectedLayout from "@/components/layout/ProtectedLayout";

export default function UsersPage() {
  return (
    <ProtectedLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Users</h1>
      {/* TODO Yassin: user list, invite user, role badge */}
    </ProtectedLayout>
  );
}
