import { db, budgetEntries, chores, pantryItems, familyEvents } from "@workspace/db";
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

  return lines.join("\n");
}
