import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export function getReqUserId(req: Request): string | null {
  try {
    const auth = getAuth(req);
    if (auth?.userId) return auth.userId;
  } catch {
    /* Clerk not configured or skipped */
  }
  return process.env.NODE_ENV !== "production" ? "dev_admin_user" : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = getReqUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).clerkUserId = userId;
  next();
}
