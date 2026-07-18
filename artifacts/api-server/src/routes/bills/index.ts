import { Router, type IRouter, type Request, type Response } from "express";
import { db, bills } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/bills", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(bills).where(eq(bills.isActive, true)).orderBy(asc(bills.dueDayOfMonth));
  res.json(rows);
});

router.post("/bills", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name, amountCents, dueDayOfMonth, category, autoPay, notes } = req.body;
  if (!name || !amountCents || !dueDayOfMonth) {
    res.status(400).json({ error: "name, amountCents, dueDayOfMonth required" }); return;
  }
  const [row] = await db.insert(bills)
    .values({ name, amountCents: Number(amountCents), dueDayOfMonth: Number(dueDayOfMonth), category, autoPay: Boolean(autoPay), notes })
    .returning();
  res.status(201).json(row);
});

router.patch("/bills/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name, amountCents, dueDayOfMonth, category, autoPay, notes, isActive } = req.body;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (amountCents !== undefined) update.amountCents = Number(amountCents);
  if (dueDayOfMonth !== undefined) update.dueDayOfMonth = Number(dueDayOfMonth);
  if (category !== undefined) update.category = category;
  if (autoPay !== undefined) update.autoPay = Boolean(autoPay);
  if (notes !== undefined) update.notes = notes;
  if (isActive !== undefined) update.isActive = Boolean(isActive);
  const [row] = await db.update(bills).set(update).where(eq(bills.id, Number(req.params.id))).returning();
  res.json(row);
});

router.delete("/bills/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await db.delete(bills).where(eq(bills.id, Number(req.params.id)));
  res.status(204).end();
});

export default router;
