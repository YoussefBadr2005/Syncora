import { Request, Response, NextFunction } from "express";
import { isManagerRole } from "../lib/roles";

export function enforceTeamAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
  if (isManagerRole(req.user.role)) return next();
  req.teamId = req.user.teamId;
  return next();
}

export function assertTeamMatches(req: Request, resourceTeamId: string): boolean {
  if (!req.user) return false;
  if (isManagerRole(req.user.role)) return true;
  return req.user.teamId === resourceTeamId;
}
