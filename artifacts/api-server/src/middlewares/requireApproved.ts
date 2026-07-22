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

  let [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));

  if (!member) {
    // Wrap in a transaction to prevent the admin-assignment race condition.
    // A partial unique index on (role) WHERE role = 'admin' provides the DB-level
    // guarantee: if two concurrent sign-ups race, the second INSERT will throw a
    // unique-constraint error instead of silently creating a second admin.
    try {
      member = await db.transaction(async (tx) => {
        const [existingAdmin] = await tx.select().from(familyMembers).where(eq(familyMembers.role, "admin"));
        const isFirst = !existingAdmin;
        const [inserted] = await tx.insert(familyMembers).values({
          clerkUserId,
          role: isFirst ? "admin" : "member",
          // Only the very first user (who becomes admin) is auto-approved.
          // Everyone else waits for admin approval.
          status: isFirst ? "approved" : "pending",
          featureFlags: DEFAULT_FLAGS,
        }).returning();
        return inserted;
      });
    } catch (err: unknown) {
      // Handle duplicate key from a concurrent insert (race on clerkUserId unique or admin index).
      // Re-fetch the row that the concurrent request inserted.
      const isUniqueViolation = err instanceof Error && err.message.includes("unique");
      if (!isUniqueViolation) throw err;
      const [existing] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));
      if (!existing) throw err; // shouldn't happen; re-throw
      member = existing;
    }
  }

  if (member.status !== "approved") {
    res.status(403).json({ error: "pending_approval", message: "Your account is awaiting admin approval." });
    return;
  }

  (req as any).familyMember = member;
  next();
}
