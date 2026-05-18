import type { Role } from "@/types";

/** Managers are org admins; legacy tokens may still use role "admin". */
export function isManagerRole(role: Role | string | undefined): boolean {
  return role === "manager" || role === "admin";
}
