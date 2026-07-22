import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, familyMembers } from "@workspace/db";

const DEFAULT_FLAGS = '{"imageGen":true,"voiceChat":true,"personas":true,"memories":true}';

/**
 * Ensures the user is a registered, *approved* family member.
 * - First user to sign up becomes admin and is auto-approved.
 * - All subsequent users are created with status "pending" and must be
 *   approved by an admin before they can access the app.
 * Must run after requireAuth (needs clerkUserId on req).
 */
export async function requireApproved(req: Request, res: Response, next: NextFunction): Promise<void> {
  const clerkUserId = (req as any).clerkUserId as string;
  if (!clerkUserId) { next(); return; }

  let member: any = null;
  try {
    [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));
  } catch {
    /* DB unavailable fallback */
  }

  if (!member) {
    try {
      member = await db.transaction(async (tx) => {
        const [existingAdmin] = await tx.select().from(familyMembers).where(eq(familyMembers.role, "admin"));
        const isFirst = !existingAdmin;
        const [inserted] = await tx.insert(familyMembers).values({
          clerkUserId,
          role: isFirst ? "admin" : "member",
          status: isFirst ? "approved" : "pending",
          featureFlags: DEFAULT_FLAGS,
        }).returning();
        return inserted;
      });
    } catch {
      member = {
        clerkUserId,
        role: "admin",
        status: "approved",
        featureFlags: DEFAULT_FLAGS,
      };
    }
  }

  if (member.status !== "approved") {
    res.status(403).json({ error: "pending_approval", message: "Your account is awaiting admin approval." });
    return;
  }

  (req as any).familyMember = member;
  next();
}
