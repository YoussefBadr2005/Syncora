import { Request, Response, NextFunction } from "express";

export function enforceTeamAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
  if (req.user.role === "manager" || req.user.role === "admin") return next();
  req.teamId = req.user.teamId;
  return next();
}

export function assertTeamMatches(req: Request, resourceTeamId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === "manager" || req.user.role === "admin") return true;
  return req.user.teamId === resourceTeamId;
}
