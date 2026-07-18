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

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

export type BudgetMonthTarget =
  | { kind: "single"; year: number; month: number }
  | { kind: "range"; startYear: number; startMonth: number; endYear: number; endMonth: number };

/**
 * Detect which month(s) a budget question is referring to.
 * Returns null when the question is about the current month (default behaviour).
 */
export function detectBudgetMonth(msg: string): BudgetMonthTarget | null {
  const lower = msg.toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-based

  // "last month"
  if (/last\s+month/i.test(msg)) {
    let y = currentYear;
    let m = currentMonth - 1;
    if (m < 1) { m = 12; y--; }
    return { kind: "single", year: y, month: m };
  }

  // "two months ago", "3 months ago"
  const monthsAgoMatch = msg.match(/(\d+|two|three|four|five|six)\s+months?\s+ago/i);
  if (monthsAgoMatch) {
    const wordNums: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
    const n = wordNums[monthsAgoMatch[1].toLowerCase()] ?? parseInt(monthsAgoMatch[1]);
    let m = currentMonth - n;
    let y = currentYear;
    while (m < 1) { m += 12; y--; }
    return { kind: "single", year: y, month: m };
  }

  // Q1 / Q2 / Q3 / Q4 (optionally with year)
  const quarterMatch = msg.match(/\bq([1-4])\b(?:\s+(\d{4}))?/i);
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1]);
    const y = quarterMatch[2] ? parseInt(quarterMatch[2]) : currentYear;
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return { kind: "range", startYear: y, startMonth, endYear: y, endMonth };
  }

  // Named month with optional year: "in June", "June 2024", "last June"
  const monthPattern = new RegExp(
    `\\b(${Object.keys(MONTH_NAMES).join("|")})(?:\\s+(\\d{4}))?\\b`,
    "i",
  );
  const namedMatch = lower.match(monthPattern);
  if (namedMatch) {
    const monthNum = MONTH_NAMES[namedMatch[1].toLowerCase()]!;
    let y = namedMatch[2] ? parseInt(namedMatch[2]) : currentYear;
    // If the named month is in the future this year, assume last year
    if (y === currentYear && monthNum > currentMonth) y--;
    return { kind: "single", year: y, month: monthNum };
  }

  // "this month" — explicitly current month; return null (use default)
  if (/this\s+month/i.test(msg)) return null;

  return null;
}

function monthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthDateRange(year: number, month: number): { start: string; end: string; label: string } {
  const label = monthLabel(year, month);
  const start = `${label}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${label}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, label };
}

async function fetchEntriesForRange(
  startDate: string,
  endDate: string,
  approvedIds: string[],
) {
  return db
    .select()
    .from(budgetEntries)
    .where(
      and(
        gte(budgetEntries.entryDate, startDate),
        lte(budgetEntries.entryDate, endDate),
        inArray(budgetEntries.clerkUserId, approvedIds),
      ),
    );
}

function buildMonthSummary(entries: typeof budgetEntries.$inferSelect[], label: string): string[] {
  if (entries.length === 0) {
    return [`[Budget Context for ${label}]`, `No budget entries recorded for this period.`];
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

  const fmt = (n: number) => n.toFixed(2);
  const lines: string[] = [
    `[Budget Context for ${label}]`,
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

  return lines;
}

export async function getBudgetContext(
  callerClerkUserId: string,
  target?: BudgetMonthTarget | null,
): Promise<string> {
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

  // Default: current month
  if (!target) {
    const now = new Date();
    const { start, end, label } = monthDateRange(now.getFullYear(), now.getMonth() + 1);
    const entries = await fetchEntriesForRange(start, end, approvedIds);
    return buildMonthSummary(entries, label).join("\n");
  }

  if (target.kind === "single") {
    const { start, end, label } = monthDateRange(target.year, target.month);
    const entries = await fetchEntriesForRange(start, end, approvedIds);
    return buildMonthSummary(entries, label).join("\n");
  }

  // Range: collect each month separately so the AI sees per-month breakdowns
  const sections: string[] = [];
  let y = target.startYear;
  let m = target.startMonth;
  while (y < target.endYear || (y === target.endYear && m <= target.endMonth)) {
    const { start, end, label } = monthDateRange(y, m);
    const entries = await fetchEntriesForRange(start, end, approvedIds);
    sections.push(...buildMonthSummary(entries, label));
    sections.push("");
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return sections.join("\n");
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
