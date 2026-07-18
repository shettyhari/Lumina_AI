import { Router, type IRouter, type Request, type Response } from "express";
import { db, choreRewards, rewardRedemptions, chores, familyMembers } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router: IRouter = Router();

// Catalog
router.get("/rewards", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const catalog = await db.select().from(choreRewards).where(eq(choreRewards.isActive, true));
  res.json(catalog);
});

router.post("/rewards", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const { title, description, pointCost, emoji } = req.body;
  if (!title || !pointCost) { res.status(400).json({ error: "title and pointCost required" }); return; }
  const [reward] = await db.insert(choreRewards).values({ title, description, pointCost: Number(pointCost), emoji }).returning();
  res.status(201).json(reward);
});

router.delete("/rewards/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  await db.update(choreRewards).set({ isActive: false }).where(eq(choreRewards.id, Number(req.params.id)));
  res.status(204).end();
});

// Point balances per family member
router.get("/rewards/balances", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const members = await db.select().from(familyMembers);
  const completedChores = await db.select().from(chores).where(eq(chores.status, "done"));
  const approvedRedemptions = await db.select().from(rewardRedemptions).where(eq(rewardRedemptions.status, "approved"));

  const POINTS_PER_CHORE = 10;
  const balances = members.map(m => {
    const earned = completedChores
      .filter(c => c.assignedToClerkUserId === m.clerkUserId)
      .length * POINTS_PER_CHORE;
    const spent = approvedRedemptions
      .filter(r => r.clerkUserId === m.clerkUserId)
      .reduce((acc, r) => acc + r.pointsSpent, 0);
    return { memberId: m.id, clerkUserId: m.clerkUserId, name: m.displayName ?? m.email ?? "Member", earned, spent, balance: earned - spent };
  });
  res.json(balances);
});

// Request redemption
router.post("/rewards/redeem", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { rewardId } = req.body;
  if (!rewardId) { res.status(400).json({ error: "rewardId required" }); return; }
  const [reward] = await db.select().from(choreRewards).where(eq(choreRewards.id, Number(rewardId))).limit(1);
  if (!reward) { res.status(404).json({ error: "Reward not found" }); return; }
  const [redemption] = await db.insert(rewardRedemptions).values({ rewardId: reward.id, clerkUserId, pointsSpent: reward.pointCost }).returning();
  res.status(201).json(redemption);
});

// List redemptions
router.get("/rewards/redemptions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(rewardRedemptions).orderBy(desc(rewardRedemptions.redeemedAt));
  res.json(rows);
});

// Admin approve/reject
router.patch("/rewards/redemptions/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const approvedBy = (req as any).clerkUserId as string;
  const { status } = req.body;
  if (!["approved", "rejected"].includes(status)) { res.status(400).json({ error: "status must be approved or rejected" }); return; }
  const [row] = await db.update(rewardRedemptions).set({ status, approvedBy }).where(eq(rewardRedemptions.id, Number(req.params.id))).returning();
  res.json(row);
});

export default router;
