import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { verifySessionToken } from "../lib/sessionToken";

export function getReqUserId(req: Request): string | null {
  // 1. Check Bearer Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const verified = verifySessionToken(token);
    if (verified?.userId) {
      (req as any).userSession = verified;
      return verified.userId;
    }
  }

  // 2. Check HttpOnly cookie
  const cookieToken = req.cookies?.lumina_session_token;
  if (cookieToken) {
    const verified = verifySessionToken(cookieToken);
    if (verified?.userId) {
      (req as any).userSession = verified;
      return verified.userId;
    }
  }

  // 3. Check Clerk auth if present
  try {
    const clerkAuth = getAuth(req);
    if (clerkAuth?.userId) return clerkAuth.userId;
  } catch {
    /* Clerk skipped or unconfigured */
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized: Access token is invalid or expired." });
    return;
  }
  (req as any).clerkUserId = userId;
  next();
}
