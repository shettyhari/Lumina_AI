import { db, budgetEntries, chores, pantryItems, familyEvents, bills } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";

/** Small aggregate queries across budget/chores/pantry/calendar, formatted as
 *  plain-text lines for LLM prompts (the digest, and the weekly-insight
 *  automation). Nothing here is itself LLM-generated. */
export async function getCrossModuleStats(clerkUserId: string): Promise<string> {
  const now = new Date();
  const lines: string[] = [];

  try {
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const budgetRows = await db.select().from(budgetEntries)
      .where(and(eq(budgetEntries.clerkUserId, clerkUserId), gte(budgetEntries.entryDate, monthStart)));
    let income = 0, expenses = 0;
    for (const r of budgetRows) {
      const amt = parseFloat(r.amount as string);
      if (r.type === "income") income += amt; else expenses += amt;
    }
    if (budgetRows.length > 0) lines.push(`Budget this month: $${income.toFixed(2)} income, $${expenses.toFixed(2)} expenses (${budgetRows.length} entries).`);
  } catch { /* module data unavailable, skip */ }

  try {
    const alerts = await getSpendingTrendAlerts(clerkUserId, now);
    if (alerts.length > 0) lines.push(`Spending alerts:\n${alerts.map((a) => `  ⚠ ${a}`).join("\n")}`);
  } catch { /* module data unavailable, skip */ }

  try {
    const choreRows = await db.select().from(chores).where(eq(chores.status, "todo"));
    const overdue = choreRows.filter((c) => c.dueDate && c.dueDate < now.toISOString().slice(0, 10));
    if (choreRows.length > 0) lines.push(`Chores: ${choreRows.length} open, ${overdue.length} overdue.`);
  } catch { /* module data unavailable, skip */ }

  try {
    const soon = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const pantryRows = await db.select().from(pantryItems).where(eq(pantryItems.clerkUserId, clerkUserId));
    const expiringSoon = pantryRows.filter((p) => p.expiresAt && new Date(p.expiresAt) <= soon && new Date(p.expiresAt) >= now);
    if (expiringSoon.length > 0) lines.push(`Pantry: ${expiringSoon.length} item(s) expiring within 5 days (${expiringSoon.map((p) => p.name).slice(0, 5).join(", ")}).`);
  } catch { /* module data unavailable, skip */ }

  try {
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eventRows = await db.select().from(familyEvents)
      .where(and(eq(familyEvents.clerkUserId, clerkUserId), gte(familyEvents.startAt, now), lte(familyEvents.startAt, weekOut)));
    if (eventRows.length > 0) lines.push(`Calendar: ${eventRows.length} event(s) in the next 7 days (${eventRows.map((e) => e.title).slice(0, 5).join(", ")}).`);
  } catch { /* module data unavailable, skip */ }

  try {
    const allBills = await db.select().from(bills).where(eq(bills.isActive, true));
    const today = now.getDate();
    const dueSoon = allBills.filter((b) => b.dueDayOfMonth >= today && b.dueDayOfMonth <= today + 7);
    if (dueSoon.length > 0) {
      const list = dueSoon.map((b) => `${b.name} ($${(b.amountCents / 100).toFixed(2)}, due day ${b.dueDayOfMonth})`).join(", ");
      lines.push(`Bills due within 7 days: ${list}.`);
    }
  } catch { /* module data unavailable, skip */ }

  return lines.join("\n");
}

/**
 * Flags categories on pace to significantly exceed last month's spending.
 * Projects the current month's spend-so-far out to a full month (so day 5
 * isn't unfairly compared to day 30) and compares that projection against
 * last month's actual total in the same category. Ignored below MIN_BASELINE
 * so a single new $15 category doesn't read as a 200% "alert", and skipped
 * entirely in the first few days of the month where the projection is too
 * noisy to mean anything.
 */
async function getSpendingTrendAlerts(clerkUserId: string, now: Date): Promise<string[]> {
  const dayOfMonth = now.getDate();
  if (dayOfMonth < 5) return [];

  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const thisStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const thisEnd = now.toISOString().slice(0, 10);

  const prevMonthDate = new Date(year, month - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();
  const prevStart = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;
  const prevDaysInMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
  const prevEnd = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(prevDaysInMonth).padStart(2, "0")}`;

  const [thisRows, prevRows] = await Promise.all([
    db.select().from(budgetEntries).where(and(
      eq(budgetEntries.clerkUserId, clerkUserId), eq(budgetEntries.type, "expense"),
      gte(budgetEntries.entryDate, thisStart), lte(budgetEntries.entryDate, thisEnd),
    )),
    db.select().from(budgetEntries).where(and(
      eq(budgetEntries.clerkUserId, clerkUserId), eq(budgetEntries.type, "expense"),
      gte(budgetEntries.entryDate, prevStart), lte(budgetEntries.entryDate, prevEnd),
    )),
  ]);

  const sumByCategory = (rows: typeof thisRows) => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.category, (map.get(r.category) ?? 0) + parseFloat(r.amount as string));
    return map;
  };
  const thisTotals = sumByCategory(thisRows);
  const prevTotals = sumByCategory(prevRows);

  const MIN_BASELINE = 20;
  const OVERAGE_THRESHOLD = 1.2; // flag at 20%+ over pace
  const alerts: { pctOver: number; text: string }[] = [];

  for (const [category, spent] of thisTotals) {
    const prevSpent = prevTotals.get(category) ?? 0;
    if (prevSpent < MIN_BASELINE) continue;
    const projected = (spent / dayOfMonth) * daysInMonth;
    if (projected < prevSpent * OVERAGE_THRESHOLD) continue;
    const pctOver = Math.round((projected / prevSpent - 1) * 100);
    alerts.push({
      pctOver,
      text: `${category} is trending ${pctOver}% over last month's pace ($${spent.toFixed(2)} so far, projected ~$${projected.toFixed(2)} vs $${prevSpent.toFixed(2)} last month).`,
    });
  }

  return alerts.sort((a, b) => b.pctOver - a.pctOver).slice(0, 3).map((a) => a.text);
}
