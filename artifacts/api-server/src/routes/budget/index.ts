import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db, budgetEntries, familyMembers } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

async function enrichEntries(entries: typeof budgetEntries.$inferSelect[]) {
  const members = await db.select().from(familyMembers);
  const map = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));
  return entries.map((e) => ({
    ...e,
    memberName: map[e.clerkUserId]?.displayName ?? map[e.clerkUserId]?.email?.split("@")[0] ?? "Member",
    memberAvatarUrl: map[e.clerkUserId]?.avatarUrl ?? null,
  }));
}

router.get("/budget/entries", requireAuth, async (req, res): Promise<void> => {
  const month = req.query.month as string | undefined; // YYYY-MM
  let entries: typeof budgetEntries.$inferSelect[];
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const endDate = new Date(y, m, 0); // last day of month
    const end = `${month}-${String(endDate.getDate()).padStart(2, "0")}`;
    entries = await db.select().from(budgetEntries)
      .where(and(gte(budgetEntries.entryDate, start), lte(budgetEntries.entryDate, end)))
      .orderBy(desc(budgetEntries.entryDate));
  } else {
    entries = await db.select().from(budgetEntries).orderBy(desc(budgetEntries.entryDate)).limit(100);
  }
  res.json(await enrichEntries(entries));
});

router.get("/budget/summary", requireAuth, async (req, res): Promise<void> => {
  const month = req.query.month as string | undefined;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month is required (YYYY-MM)" }); return;
  }
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const endDate = new Date(y, m, 0);
  const end = `${month}-${String(endDate.getDate()).padStart(2, "0")}`;
  const rows = await db.select().from(budgetEntries)
    .where(and(gte(budgetEntries.entryDate, start), lte(budgetEntries.entryDate, end)));
  let totalIncome = 0, totalExpenses = 0;
  for (const r of rows) {
    const amt = parseFloat(r.amount as string);
    if (r.type === "income") totalIncome += amt;
    else totalExpenses += amt;
  }
  res.json({ month, totalIncome, totalExpenses, net: totalIncome - totalExpenses, entryCount: rows.length });
});

router.post("/budget/entries", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { type, amount, category = "Other", description = "", entryDate } = req.body ?? {};
  if (!type || !["income", "expense"].includes(type)) {
    res.status(400).json({ error: "type must be income or expense" }); return;
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) { res.status(400).json({ error: "amount must be a positive number" }); return; }
  if (!entryDate) { res.status(400).json({ error: "entryDate is required (YYYY-MM-DD)" }); return; }
  const [entry] = await db.insert(budgetEntries).values({
    clerkUserId, type, amount: String(amt.toFixed(2)), category: String(category),
    description: String(description), entryDate,
  }).returning();
  const [enriched] = await enrichEntries([entry]);
  res.status(201).json(enriched);
});

router.delete("/budget/entries/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(budgetEntries).where(and(eq(budgetEntries.id, id), eq(budgetEntries.clerkUserId, clerkUserId)));
  res.status(204).end();
});

export default router;
