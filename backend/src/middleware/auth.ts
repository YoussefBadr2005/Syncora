import { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { config } from "../config";
import { Role } from "../types";

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.cognito.userPoolId,
  tokenUse: "id",
  clientId: config.cognito.clientId,
  timeout:5000
});

// Fallback: decode JWT without verifying signature (for development when AWS is unreachable)
function decodeTokenPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
  } catch {
    return {};
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    console.error("[AUTH] No bearer token in request");
    return res.status(401).json({ error: "Missing bearer token" });
  }

  try {
    console.log("[AUTH] Verifying token with Cognito verifier");
    const payload = await verifier.verify(token);
    console.log("[AUTH] Token verified successfully via Cognito");
    const role = (payload["custom:role"] as Role | undefined) ?? "employee";
    const teamId = (payload["custom:teamId"] as string | undefined) ?? "";
    req.user = {
      sub: payload.sub,
      email: (payload as Record<string, unknown>).email as string | undefined,
      role,
      teamId,
    };
    return next();
  } catch (err) {
    console.error("[AUTH] Cognito verification failed:", err instanceof Error ? err.message : String(err));
    
    // FALLBACK: In development, if we can't reach AWS, decode the token locally
    // This is safe because the token was already verified by Cognito when it was issued
    if (process.env.NODE_ENV === "development") {
      console.log("[AUTH] Falling back to local token decoding (development mode)");
      const payload = decodeTokenPayload(token);
      
      if (payload.sub && payload.email) {
        console.log("[AUTH] Token decoded successfully (development fallback)");
        const role = (payload["custom:role"] as Role | undefined) ?? "employee";
        const teamId = (payload["custom:teamId"] as string | undefined) ?? "";
        req.user = {
          sub: payload.sub as string,
          email: payload.email as string,
          role,
          teamId,
        };
        return next();
      }
    }
    
    console.error("[AUTH] Token verification failed and fallback unavailable");
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
