import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { config } from "../config";
import { Role } from "../types";

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognito.userPoolId,
  tokenUse: "id",
  clientId: config.cognito.clientId,
});

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  try {
    const payload = await verifier.verify(token);
    const role = (payload["custom:role"] as Role | undefined) ?? "employee";
    const teamId = (payload["custom:teamId"] as string | undefined) ?? "";
    const orgId = (payload["custom:orgId"] as string | undefined) ?? "";
    req.user = {
      sub: payload.sub,
      email: (payload as Record<string, unknown>).email as string | undefined,
      role,
      teamId,
      orgId,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    return next();
  };
}
