// OWNER: Abdelrahman — Teams list + members (manager only)
"use client";

import ProtectedLayout from "@/components/layout/ProtectedLayout";
import { useTeams } from "@/hooks/useTeams";
import Spinner from "@/components/ui/Spinner";
import ErrorMessage from "@/components/ui/ErrorMessage";

export default function TeamsPage() {
  const { teams, loading, error } = useTeams();

  if (loading) return <ProtectedLayout><Spinner /></ProtectedLayout>;
  if (error)   return <ProtectedLayout><ErrorMessage message={error} /></ProtectedLayout>;

  return (
    <ProtectedLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Teams</h1>
      {/* TODO Abdelrahman: team cards, member list, add member button (manager only) */}
      <pre className="text-xs text-gray-400">{JSON.stringify(teams, null, 2)}</pre>
    </ProtectedLayout>
  );
}
