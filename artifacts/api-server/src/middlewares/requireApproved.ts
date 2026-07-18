import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, familyMembers } from "@workspace/db";

const DEFAULT_FLAGS = '{"imageGen":true,"voiceChat":true,"personas":true,"memories":true}';

/**
 * Ensures the user is an approved family member.
 * - First user with no admin automatically becomes admin (approved).
 * - Subsequent users are created as "pending" until admin approves them.
 * - Must run after requireAuth (needs clerkUserId on req).
 */
export async function requireApproved(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clerkUserId = (req as any).clerkUserId as string;
  if (!clerkUserId) { next(); return; }

  let [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));

  if (!member) {
    // First user with no admin becomes admin
    const [existingAdmin] = await db.select().from(familyMembers).where(eq(familyMembers.role, "admin"));
    if (!existingAdmin) {
      [member] = await db.insert(familyMembers).values({
        clerkUserId,
        role: "admin",
        status: "approved",
        featureFlags: DEFAULT_FLAGS,
      }).returning();
    } else {
      [member] = await db.insert(familyMembers).values({
        clerkUserId,
        featureFlags: DEFAULT_FLAGS,
      }).returning();
    }
  }

  // Admins and approved members pass through
  if (member.role === "admin" || member.status === "approved") {
    (req as any).familyMember = member;
    next();
    return;
  }

  if (member.status === "rejected") {
    res.status(403).json({ error: "access_rejected", message: "Your access was declined by the family admin." });
    return;
  }

  // pending
  res.status(403).json({ error: "pending_approval", message: "Your account is pending admin approval." });
}
