// OWNER: Youssef Khaled — Task detail: comments, image upload, status change
"use client";

import ProtectedLayout from "@/components/layout/ProtectedLayout";

export default function TaskDetailPage({ params }: { params: { id: string } }) {
  return (
    <ProtectedLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Task Detail</h1>
      <p className="text-gray-500 text-sm">Task ID: {params.id}</p>
      {/* TODO Youssef Khaled: task info, status selector, comments, image upload */}
    </ProtectedLayout>
  );
}
