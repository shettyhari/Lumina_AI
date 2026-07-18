import { Router, type IRouter } from "express";
import { eq, sum } from "drizzle-orm";
import { db, familyMembers } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router: IRouter = Router();

function parseMember(m: typeof familyMembers.$inferSelect) {
  let featureFlags: Record<string, boolean> = { imageGen: true, voiceChat: true, personas: true, memories: true };
  try { featureFlags = JSON.parse(m.featureFlags || "{}"); } catch { /* use default */ }
  return { ...m, featureFlags };
}

// GET /admin/users — list all family members
router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const members = await db.select().from(familyMembers).orderBy(familyMembers.createdAt);
  res.json(members.map(parseMember));
});

// GET /admin/stats — family-wide storage & user counts
router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  const members = await db.select().from(familyMembers);
  const totalQuota = members.reduce((acc, m) => acc + (m.storageQuotaBytes ?? 0), 0);
  const totalUsed = members.reduce((acc, m) => acc + (m.storageUsedBytes ?? 0), 0);
  res.json({
    totalMembers: members.length,
    pendingCount: members.filter((m) => m.status === "pending").length,
    approvedCount: members.filter((m) => m.status === "approved" || m.role === "admin").length,
    rejectedCount: members.filter((m) => m.status === "rejected").length,
    totalQuotaBytes: totalQuota,
    totalUsedBytes: totalUsed,
  });
});

// PATCH /admin/users/:userId — update a member
router.patch("/admin/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.params.userId as string;
  const { status, storageQuotaBytes, featureFlags, displayName } = req.body ?? {};

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updateData.status = String(status);
  if (storageQuotaBytes !== undefined) updateData.storageQuotaBytes = Number(storageQuotaBytes);
  if (featureFlags !== undefined) updateData.featureFlags = JSON.stringify(featureFlags);
  if (displayName !== undefined) updateData.displayName = String(displayName);

  const [updated] = await db
    .update(familyMembers)
    .set(updateData)
    .where(eq(familyMembers.clerkUserId, userId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Member not found" }); return; }
  res.json(parseMember(updated));
});

// DELETE /admin/users/:userId — remove a member
router.delete("/admin/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.params.userId as string;
  const adminClerkUserId = (req as any).clerkUserId as string;

  if (userId === adminClerkUserId) {
    res.status(400).json({ error: "Cannot remove yourself" });
    return;
  }

  await db.delete(familyMembers).where(eq(familyMembers.clerkUserId, userId));
  res.status(204).end();
});

export default router;
