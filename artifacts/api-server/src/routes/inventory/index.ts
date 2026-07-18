import { Router, type IRouter, type Request, type Response } from "express";
import { db, homeInventory } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/inventory", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const items = await db.select().from(homeInventory).orderBy(asc(homeInventory.name));
  res.json(items);
});

router.post("/inventory", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name, category, brand, model, serialNumber, purchasedAt, purchasePriceCents, warrantyExpiry, location, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [item] = await db.insert(homeInventory).values({
    name, category, brand, model, serialNumber,
    purchasedAt: purchasedAt ? new Date(purchasedAt) : null,
    purchasePriceCents: purchasePriceCents ? Number(purchasePriceCents) : null,
    warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
    location, notes,
  }).returning();
  res.status(201).json(item);
});

router.patch("/inventory/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name, category, brand, model, serialNumber, purchasedAt, purchasePriceCents, warrantyExpiry, location, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (category !== undefined) update.category = category;
  if (brand !== undefined) update.brand = brand;
  if (model !== undefined) update.model = model;
  if (serialNumber !== undefined) update.serialNumber = serialNumber;
  if (purchasedAt !== undefined) update.purchasedAt = purchasedAt ? new Date(purchasedAt) : null;
  if (purchasePriceCents !== undefined) update.purchasePriceCents = Number(purchasePriceCents);
  if (warrantyExpiry !== undefined) update.warrantyExpiry = warrantyExpiry ? new Date(warrantyExpiry) : null;
  if (location !== undefined) update.location = location;
  if (notes !== undefined) update.notes = notes;
  const [item] = await db.update(homeInventory).set(update).where(eq(homeInventory.id, Number(req.params.id))).returning();
  res.json(item);
});

router.delete("/inventory/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await db.delete(homeInventory).where(eq(homeInventory.id, Number(req.params.id)));
  res.status(204).end();
});

export default router;
