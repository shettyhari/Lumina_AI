import { db, shoppingItems, chores, familyEvents, reminders } from "@workspace/db";

export type IntentAction =
  | { type: "shopping"; items: string[] }
  | { type: "reminder"; message: string; remindAt: Date }
  | { type: "chore"; title: string }
  | { type: "event"; title: string; startAt: Date }
  | null;

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
