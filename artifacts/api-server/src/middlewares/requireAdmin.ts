import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, familyMembers } from "@workspace/db";

/**
 * Ensures the authenticated user has the "admin" role.
 * Must run after requireApproved (so the family member row exists).
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clerkUserId = (req as any).clerkUserId as string;
  // If familyMember was cached by requireApproved, use it
  const cached = (req as any).familyMember;
  const member = cached ?? (await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId)))[0];
  if (!member || member.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
