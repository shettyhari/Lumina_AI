import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, familyMembers } from "@workspace/db";

const DEFAULT_FLAGS = '{"imageGen":true,"voiceChat":true,"personas":true,"memories":true}';

/**
 * Ensures the user is a registered family member.
 * All authenticated users are automatically approved — no admin gate.
 * Must run after requireAuth (needs clerkUserId on req).
 */
export async function requireApproved(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clerkUserId = (req as any).clerkUserId as string;
  if (!clerkUserId) { next(); return; }

  let [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));

  if (!member) {
    // First user becomes admin, everyone else is auto-approved as a member
    const [existingAdmin] = await db.select().from(familyMembers).where(eq(familyMembers.role, "admin"));
    const isFirst = !existingAdmin;
    [member] = await db.insert(familyMembers).values({
      clerkUserId,
      role: isFirst ? "admin" : "member",
      status: "approved",
      featureFlags: DEFAULT_FLAGS,
    }).returning();
  } else if (member.status !== "approved") {
    // Auto-approve any previously pending/rejected member
    [member] = await db.update(familyMembers)
      .set({ status: "approved" })
      .where(eq(familyMembers.clerkUserId, clerkUserId))
      .returning();
  }

  (req as any).familyMember = member;
  next();
}
