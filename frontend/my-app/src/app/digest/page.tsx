"use client";

import { useDigest } from "@/hooks/useDigest";
import ProtectedLayout from "@/components/layout/ProtectedLayout";
import Spinner from "@/components/ui/Spinner";
import ErrorMessage from "@/components/ui/ErrorMessage";
import type { Task } from "@/types";

export default function DigestPage() {
  const { digest, loading, error } = useDigest();

  if (loading) return <ProtectedLayout><Spinner /></ProtectedLayout>;
  if (error) return <ProtectedLayout><ErrorMessage message={error} /></ProtectedLayout>;

  const taskCount = digest?.total ?? 0;

  return (
    <ProtectedLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Digest</h1>
          <p className="text-gray-600 mt-1">
            Tasks due on {new Date(digest?.date ?? "").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Summary Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg p-6 border border-blue-200">
          <div className="text-center">
            <p className="text-blue-600 text-sm font-semibold uppercase tracking-wide">
              Due Today
            </p>
            <p className="text-5xl font-bold text-blue-900 mt-2">{taskCount}</p>
            <p className="text-blue-700 text-sm mt-2">
              {taskCount === 1 ? "task" : "tasks"} assigned across the team
            </p>
          </div>
        </div>

        {/* Tasks by Assignee */}
        {taskCount === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No tasks due today</p>
            <p className="text-gray-400 text-sm mt-1">Great job! You're all caught up.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(digest?.byAssignee ?? {}).map(([assigneeId, tasks]) => (
              <div key={assigneeId} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">
                    {assigneeId === "unassigned" ? "Unassigned" : `Assigned to ${assigneeId}`}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
                  </p>
                </div>
                <div className="divide-y divide-gray-200">
                  {(tasks as Task[]).map((task) => (
                    <div
                      key={task.taskId}
                      className="px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">
                            {task.title}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {task.description || "No description"}
                          </p>
                          <div className="flex gap-2 mt-2">
                            <span
                              className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                                task.priority === "High"
                                  ? "bg-red-100 text-red-800"
                                  : task.priority === "Medium"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {task.priority}
                            </span>
                            <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                              {task.status}
                            </span>
                          </div>
                        </div>
                        <a
                          href={`/tasks/${task.taskId}`}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors flex-shrink-0"
                        >
                          View
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
