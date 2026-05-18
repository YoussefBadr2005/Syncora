import { Role } from "../types";

/** Managers are org admins; legacy Cognito tokens may still use role "admin". */
export function isManagerRole(role: Role | string | undefined): boolean {
  return role === "manager" || role === "admin";
}

/** Org owner: manager with no team assignment. */
export function isOrgOwner(user: { role?: Role | string; teamId?: string }): boolean {
  return isManagerRole(user.role) && !user.teamId;
}
