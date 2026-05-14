import { Request, Response, NextFunction } from "express";

export function enforceOrgAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
  if (!req.user.orgId) {
    return res.status(403).json({ error: "Account is not attached to an organization" });
  }
  return next();
}

export function assertSameOrg(req: Request, resourceOrgId: string | undefined): boolean {
  if (!req.user) return false;
  return !!resourceOrgId && req.user.orgId === resourceOrgId;
}
