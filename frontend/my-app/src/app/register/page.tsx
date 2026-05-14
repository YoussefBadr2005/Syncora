"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Registration is now handled on the unified auth page (/login tab switcher)
export default function RegisterRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, [router]);
  return null;
}
