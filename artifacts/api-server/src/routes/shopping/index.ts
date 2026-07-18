import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, shoppingItems, familyMembers } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

// Helper: enrich with adder info
async function enrichItems(items: typeof shoppingItems.$inferSelect[]) {
  const members = await db.select().from(familyMembers);
  const map = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));
  return items.map((item) => ({
    ...item,
    adderName: map[item.clerkUserId]?.displayName ?? map[item.clerkUserId]?.email?.split("@")[0] ?? "Member",
    adderAvatarUrl: map[item.clerkUserId]?.avatarUrl ?? null,
  }));
}

router.get("/shopping", requireAuth, async (_req, res): Promise<void> => {
  const items = await db.select().from(shoppingItems).orderBy(asc(shoppingItems.sortOrder), asc(shoppingItems.createdAt));
  res.json(await enrichItems(items));
});

router.post("/shopping", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { name, quantity = "1", category = "Other" } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" }); return;
  }
  const [item] = await db.insert(shoppingItems).values({
    clerkUserId,
    name: name.trim(),
    quantity: String(quantity ?? "1"),
    category: String(category ?? "Other"),
  }).returning();
  const [enriched] = await enrichItems([item]);
  res.status(201).json(enriched);
});

router.patch("/shopping/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const updates: Record<string, unknown> = {};
  if (req.body.isChecked !== undefined) updates.isChecked = Boolean(req.body.isChecked);
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.quantity !== undefined) updates.quantity = String(req.body.quantity);
  if (req.body.category !== undefined) updates.category = String(req.body.category);
  const [updated] = await db.update(shoppingItems).set(updates).where(eq(shoppingItems.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const [enriched] = await enrichItems([updated]);
  res.json(enriched);
});

router.delete("/shopping/completed", requireAuth, async (_req, res): Promise<void> => {
  await db.delete(shoppingItems).where(eq(shoppingItems.isChecked, true));
  res.status(204).end();
});

router.delete("/shopping/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id));
  res.status(204).end();
});

export default router;
