// OWNER: Abdelrahman — Projects list + create project
"use client";

import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useProjects } from "@/hooks/useProjects";
import Spinner from "@/components/ui/Spinner";
import ErrorMessage from "@/components/ui/ErrorMessage";

export default function ProjectsPage() {
  const { projects, loading, error } = useProjects();

  if (loading) return <ProtectedLayout><Spinner /></ProtectedLayout>;
  if (error)   return <ProtectedLayout><ErrorMessage message={error} /></ProtectedLayout>;

  return (
    <ProtectedLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Projects</h1>
      {/* TODO Abdelrahman: project cards, create project button, click → tasks filtered by project */}
      <pre className="text-xs text-gray-400">{JSON.stringify(projects, null, 2)}</pre>
    </ProtectedLayout>
  );
}
