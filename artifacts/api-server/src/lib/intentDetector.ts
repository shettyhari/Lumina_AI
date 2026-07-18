import { db, shoppingItems, chores, familyEvents, reminders, budgetEntries, familyMembers } from "@workspace/db";
import { and, gte, lte, inArray, eq } from "drizzle-orm";

export type IntentAction =
  | { type: "shopping"; items: string[] }
  | { type: "reminder"; message: string; remindAt: Date }
  | { type: "chore"; title: string }
  | { type: "event"; title: string; startAt: Date }
  | null;

// ── Budget questions ───────────────────────────────────────────────────────────
const BUDGET_PATTERNS = [
  /how\s+much\s+(?:did\s+we|have\s+we|did\s+(?:the\s+)?family)\s+spend/i,
  /(?:what(?:'s|\s+is)\s+(?:our|the)\s+(?:budget|balance|spending|expenses?))/i,
  /(?:show|give|tell)\s+(?:me\s+)?(?:our|the|this\s+month'?s?)\s+budget/i,
  /(?:how\s+much\s+(?:money\s+)?(?:do\s+we\s+have|is\s+left|remains?|remaining))/i,
  /(?:budget|spending|expenses?|income)\s+(?:for\s+)?(?:this\s+month|this\s+week|today)/i,
  /(?:what\s+did\s+we\s+spend\s+on)/i,
  /(?:our|the\s+family)\s+(?:budget|finances|spending|expenses?)/i,
  /(?:total\s+(?:spent|expenses?|income|spending))/i,
  /(?:how\s+are\s+we\s+doing\s+(?:financially|with\s+(?:the\s+)?budget|with\s+money))/i,
];

export function isBudgetQuestion(msg: string): boolean {
  return BUDGET_PATTERNS.some((p) => p.test(msg));
}

export async function getBudgetContext(callerClerkUserId: string): Promise<string> {
  // Verify caller is an approved family member and collect all approved member IDs
  // so we only return entries that belong to this family.
  const approvedMembers = await db
    .select({ clerkUserId: familyMembers.clerkUserId })
    .from(familyMembers)
    .where(eq(familyMembers.status, "approved"));

  const approvedIds = approvedMembers.map((m) => m.clerkUserId);

  // Caller must be an approved member to access family budget context
  if (!approvedIds.includes(callerClerkUserId)) {
    return "[Budget Context]\nYou are not yet an approved family member. Budget data is not available.";
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthLabel = `${year}-${month}`;
  const start = `${monthLabel}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const end = `${monthLabel}-${String(lastDay).padStart(2, "0")}`;

  const entries = await db
    .select()
    .from(budgetEntries)
    .where(
      and(
        gte(budgetEntries.entryDate, start),
        lte(budgetEntries.entryDate, end),
        inArray(budgetEntries.clerkUserId, approvedIds),
      ),
    );

  if (entries.length === 0) {
    return `[Budget Context for ${monthLabel}]\nNo budget entries recorded for this month yet.`;
  }

  let totalIncome = 0;
  let totalExpenses = 0;
  const byCategory: Record<string, { income: number; expense: number }> = {};

  for (const e of entries) {
    const amt = parseFloat(e.amount as string);
    if (e.type === "income") totalIncome += amt;
    else totalExpenses += amt;
    if (!byCategory[e.category]) byCategory[e.category] = { income: 0, expense: 0 };
    if (e.type === "income") byCategory[e.category].income += amt;
    else byCategory[e.category].expense += amt;
  }

  const fmt = (n: number) => `${n.toFixed(2)}`;
  const lines: string[] = [
    `[Budget Context for ${monthLabel}]`,
    `Total Income: ${fmt(totalIncome)}`,
    `Total Expenses: ${fmt(totalExpenses)}`,
    `Net Balance: ${fmt(totalIncome - totalExpenses)}`,
    ``,
    `Breakdown by category:`,
  ];

  for (const [cat, { income, expense }] of Object.entries(byCategory)) {
    if (income > 0) lines.push(`  ${cat} (income): ${fmt(income)}`);
    if (expense > 0) lines.push(`  ${cat} (expense): ${fmt(expense)}`);
  }

  lines.push(``, `Individual entries (${entries.length} total):`);
  for (const e of entries) {
    const amt = parseFloat(e.amount as string);
    lines.push(
      `  [${e.entryDate}] ${e.type === "income" ? "+" : "-"}${fmt(amt)} | ${e.category}${e.description ? ` — ${e.description}` : ""}`,
    );
  }

  return lines.join("\n");
}

// ── Shopping list ─────────────────────────────────────────────────────────────
const SHOPPING_PATTERNS = [
  /add\s+(.+?)\s+to\s+(?:the\s+)?shopping\s+list/i,
  /(?:put|place)\s+(.+?)\s+on\s+(?:the\s+)?shopping\s+list/i,
  /(?:we\s+)?need\s+(?:to\s+buy\s+)?(.+?)\s+(?:from\s+the\s+store|at\s+the\s+grocery)/i,
];

// ── Reminder ──────────────────────────────────────────────────────────────────
const REMINDER_PATTERNS = [
  /remind\s+me\s+(?:to\s+)?(.+?)\s+(?:at|on|tomorrow|in)\s+(.+?)(?:\.|$)/i,
  /set\s+(?:a\s+)?reminder\s+(?:to\s+|for\s+)?(.+?)\s+(?:at|on)\s+(.+?)(?:\.|$)/i,
];

function parseRelativeTime(text: string): Date | null {
  const t = text.toLowerCase().trim();
  const now = new Date();
  
  if (t.includes("tomorrow")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  
  const inMatch = t.match(/in\s+(\d+)\s+(minute|hour|day)s?/i);
  if (inMatch) {
    const n = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const d = new Date(now);
    if (unit === "minute") d.setMinutes(d.getMinutes() + n);
    else if (unit === "hour") d.setHours(d.getHours() + n);
    else if (unit === "day") d.setDate(d.getDate() + n);
    return d;
  }
  
  // Try to parse time like "3pm", "15:00"
  const timeMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const m = parseInt(timeMatch[2] ?? "0");
    const ampm = (timeMatch[3] ?? "").toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1); // If time already passed, schedule for tomorrow
    return d;
  }
  
  return null;
}

function parseShoppingItems(raw: string): string[] {
  // Handle "milk, eggs, and bread" → ["milk", "eggs", "bread"]
  return raw
    .split(/,|\band\b/i)
    .map((s) => s.trim().replace(/^(some|a|an)\s+/i, "").trim())
    .filter((s) => s.length > 0 && s.length < 80);
}

export async function detectIntent(clerkUserId: string, msg: string): Promise<IntentAction> {
  // Shopping list detection
  for (const pattern of SHOPPING_PATTERNS) {
    const m = msg.match(pattern);
    if (m) {
      const items = parseShoppingItems(m[1]);
      if (items.length > 0) {
        return { type: "shopping", items };
      }
    }
  }
  
  // Reminder detection
  for (const pattern of REMINDER_PATTERNS) {
    const m = msg.match(pattern);
    if (m) {
      const message = m[1].trim();
      const timeText = m[2].trim();
      const remindAt = parseRelativeTime(timeText);
      if (remindAt) {
        return { type: "reminder", message, remindAt };
      }
    }
  }
  
  return null;
}

export async function executeIntent(clerkUserId: string, action: IntentAction): Promise<void> {
  if (!action) return;
  
  if (action.type === "shopping") {
    for (const name of action.items) {
      await db.insert(shoppingItems).values({ clerkUserId, name }).onConflictDoNothing();
    }
  }
  
  if (action.type === "reminder") {
    await db.insert(reminders).values({
      clerkUserId,
      message: action.message,
      remindAt: action.remindAt,
      repeat: "none",
    });
  }
}
