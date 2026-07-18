import { Router, type IRouter, type Request, type Response } from "express";
import { db, wishlists } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

// My wishlist
router.get("/wishlist", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const items = await db.select().from(wishlists).where(eq(wishlists.clerkUserId, clerkUserId)).orderBy(desc(wishlists.createdAt));
  res.json(items);
});

// All family wishlists — hide claimedBy from the item's owner to preserve gift surprise
router.get("/wishlist/family", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const items = await db.select().from(wishlists).orderBy(desc(wishlists.createdAt));
  const sanitized = items.map(item => ({
    ...item,
    claimedBy: item.clerkUserId === clerkUserId ? null : item.claimedBy,
    isClaimedByMe: item.claimedBy === clerkUserId,
  }));
  res.json(sanitized);
});

// Add wish
router.post("/wishlist", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { title, description, url, priceCents, priority } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const [item] = await db.insert(wishlists).values({ clerkUserId, title, description, url, priceCents: priceCents ? Number(priceCents) : null, priority }).returning();
  res.status(201).json(item);
});

// Delete (owner only)
router.delete("/wishlist/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  await db.delete(wishlists).where(and(eq(wishlists.id, Number(req.params.id)), eq(wishlists.clerkUserId, clerkUserId)));
  res.status(204).end();
});

// Claim a wish (hidden from owner)
router.post("/wishlist/:id/claim", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const [item] = await db.select().from(wishlists).where(eq(wishlists.id, Number(req.params.id))).limit(1);
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  if (item.clerkUserId === clerkUserId) { res.status(400).json({ error: "Cannot claim your own wish" }); return; }
  const toggle = !item.isClaimed;
  const [updated] = await db.update(wishlists)
    .set({ isClaimed: toggle, claimedBy: toggle ? clerkUserId : null })
    .where(eq(wishlists.id, Number(req.params.id)))
    .returning();
  res.json({ isClaimed: updated.isClaimed, isClaimedByMe: toggle });
});

export default router;
