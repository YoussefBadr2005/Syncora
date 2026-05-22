import { useEffect, useState } from "react";
import api from "@/lib/api";

interface Organization {
  orgId: string;
  name?: string;
}

export function useOrg() {
  const [org, setOrg] = useState<Organization | null>(null);

  useEffect(() => {
    api
      .get("/organizations/me")
      .then((r) => setOrg(r.data as Organization))
      .catch(() => setOrg(null));
  }, []);

  return org;
}
