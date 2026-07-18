/**
 * Agentic tool definitions and executors for Lumina AI.
 * Gemini function-calling declarations + server-side DB executors.
 */

import { db, shoppingItems, chores, reminders, familyEvents, budgetEntries, familyNotes, familyMembers, familyMessages, pantryItems } from "@workspace/db";
import { eq, and, gte, lte, desc, ilike, inArray } from "drizzle-orm";
import { isBudgetEntryBlockedByConfidence } from "./intentDetector.js";

// ─── Type helpers ─────────────────────────────────────────────────────────────

export interface ToolCallEvent {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultEvent {
  name: string;
  success: boolean;
  summary: string;
  data?: unknown;
}

// ─── Gemini function declarations ─────────────────────────────────────────────

export const TOOL_DECLARATIONS = [
  // Shopping
  {
    name: "add_shopping_items",
    description: "Add one or more items to the family shopping list.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "string" },
          description: "List of item names to add (e.g. ['milk', 'eggs', 'bread'])",
        },
        category: {
          type: "string",
          description: "Optional category (Produce, Dairy, Meat, Bakery, Frozen, Beverages, Snacks, Household, Personal Care, Other)",
        },
      },
      required: ["items"],
    },
  },
  {
    name: "get_shopping_list",
    description: "Get the current family shopping list, including checked and unchecked items.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "check_off_shopping_item",
    description: "Mark a shopping list item as purchased/done.",
    parameters: {
      type: "object",
      properties: {
        item_name: { type: "string", description: "The name of the item to check off" },
      },
      required: ["item_name"],
    },
  },
  // Reminders
  {
    name: "add_reminder",
    description: "Create a reminder for the user. Use ISO 8601 format for the date/time.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "What to remind the user about" },
        remind_at: {
          type: "string",
          description: "ISO 8601 datetime when to send the reminder (e.g. '2026-07-20T09:00:00'). If relative ('tomorrow', 'in 2 hours') compute the absolute time based on current time.",
        },
        repeat: {
          type: "string",
          enum: ["none", "daily", "weekly"],
          description: "Repeat frequency (default: none)",
        },
      },
      required: ["message", "remind_at"],
    },
  },
  {
    name: "get_reminders",
    description: "Get upcoming reminders for the user.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max number of reminders to return (default 10)" },
      },
    },
  },
  // Chores
  {
    name: "add_chore",
    description: "Create a new chore/task for the household.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Chore title" },
        description: { type: "string", description: "Optional description" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level" },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format (optional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_chores",
    description: "Get the household chores list.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["todo", "in_progress", "done", "all"], description: "Filter by status (default: todo)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    name: "complete_chore",
    description: "Mark a chore as done.",
    parameters: {
      type: "object",
      properties: {
        chore_title: { type: "string", description: "Title of the chore to mark complete" },
      },
      required: ["chore_title"],
    },
  },
  // Calendar
  {
    name: "add_calendar_event",
    description: "Add an event to the family calendar.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        start_at: { type: "string", description: "ISO 8601 start datetime" },
        end_at: { type: "string", description: "ISO 8601 end datetime (optional)" },
        notes: { type: "string", description: "Additional notes (optional)" },
      },
      required: ["title", "start_at"],
    },
  },
  {
    name: "get_calendar_events",
    description: "Get upcoming family calendar events.",
    parameters: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "How many days ahead to look (default 14)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  // Budget
  {
    name: "add_budget_entry",
    description: "Record a budget entry — an expense or income.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["expense", "income"], description: "Entry type" },
        amount: { type: "number", description: "Amount in dollars" },
        category: { type: "string", description: "Category (expenses: Groceries, Utilities, Housing, Transportation, Dining, Healthcare, Education, Subscriptions, Clothing, Insurance, Entertainment; income: Salary, Freelance, Reimbursement, Investment, Rental, Gift; Other)" },
        description: { type: "string", description: "Optional description" },
        entry_date: { type: "string", description: "Date in YYYY-MM-DD format (default: today)" },
      },
      required: ["type", "amount", "category"],
    },
  },
  {
    name: "get_budget_summary",
    description: "Get a summary of income and expenses for a given month.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number", description: "Year (default: current year)" },
        month: { type: "number", description: "Month 1-12 (default: current month)" },
      },
    },
  },
  // Notes
  {
    name: "create_note",
    description: "Create a new sticky note.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        body: { type: "string", description: "Note content" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_notes",
    description: "Get family notes, optionally searching by keyword.",
    parameters: {
      type: "object",
      properties: {
        search: { type: "string", description: "Keyword to search for (optional)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  // Pantry
  {
    name: "add_pantry_item",
    description: "Add an item to the pantry inventory.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name" },
        quantity: { type: "string", description: "Quantity with unit (e.g. '2 cans', '500g')" },
        category: { type: "string", description: "Category (produce, dairy, meat, grains, canned, frozen, snacks, beverages, other)" },
        expires_at: { type: "string", description: "ISO 8601 expiry date (optional)" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_pantry",
    description: "Get current pantry items.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category (optional)" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  // Family
  {
    name: "get_family_members",
    description: "Get the list of family members.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "send_family_message",
    description: "Send a direct message to a specific family member.",
    parameters: {
      type: "object",
      properties: {
        to_name: { type: "string", description: "Name of the recipient (partial match ok)" },
        message: { type: "string", description: "Message content" },
      },
      required: ["to_name", "message"],
    },
  },
];

// ─── Tool executors ───────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function execAddShoppingItems(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const items = (args.items as string[]) ?? [];
  const category = (args.category as string) ?? "Other";
  if (items.length === 0) return { name: "add_shopping_items", success: false, summary: "No items provided." };
  for (const name of items) {
    await db.insert(shoppingItems).values({ clerkUserId, name: name.trim(), category }).onConflictDoNothing();
  }
  return { name: "add_shopping_items", success: true, summary: `Added ${items.length} item(s) to shopping list: ${items.join(", ")}` };
}

async function execGetShoppingList(_clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const items = await db.select().from(shoppingItems).orderBy(shoppingItems.createdAt);
  const pending = items.filter(i => !i.isChecked);
  const done = items.filter(i => i.isChecked);
  const summary = pending.length === 0
    ? "Shopping list is empty."
    : `${pending.length} item(s) to buy: ${pending.map(i => i.name).join(", ")}${done.length > 0 ? `. ${done.length} already checked off.` : ""}`;
  return { name: "get_shopping_list", success: true, summary, data: items };
}

async function execCheckOffShoppingItem(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const itemName = (args.item_name as string ?? "").toLowerCase();
  const all = await db.select().from(shoppingItems);
  const match = all.find(i => i.name.toLowerCase().includes(itemName) && !i.isChecked);
  if (!match) return { name: "check_off_shopping_item", success: false, summary: `Could not find "${args.item_name}" on the shopping list.` };
  await db.update(shoppingItems).set({ isChecked: true }).where(eq(shoppingItems.id, match.id));
  return { name: "check_off_shopping_item", success: true, summary: `Checked off "${match.name}" from the shopping list.` };
}

async function execAddReminder(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const message = args.message as string;
  const remindAt = new Date(args.remind_at as string);
  const repeat = (args.repeat as string) ?? "none";
  if (isNaN(remindAt.getTime())) return { name: "add_reminder", success: false, summary: "Invalid date/time for reminder." };
  await db.insert(reminders).values({ clerkUserId, message, remindAt, repeat });
  return { name: "add_reminder", success: true, summary: `Reminder set: "${message}" at ${remindAt.toLocaleString()}` };
}

async function execGetReminders(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const limit = (args.limit as number) ?? 10;
  const now = new Date();
  const rows = await db.select().from(reminders)
    .where(and(eq(reminders.clerkUserId, clerkUserId), eq(reminders.isTriggered, false)))
    .orderBy(reminders.remindAt)
    .limit(limit);
  const upcoming = rows.filter(r => new Date(r.remindAt) >= now);
  const summary = upcoming.length === 0
    ? "No upcoming reminders."
    : upcoming.map(r => `• ${r.message} (${new Date(r.remindAt).toLocaleString()})`).join("\n");
  return { name: "get_reminders", success: true, summary, data: upcoming };
}

async function execAddChore(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const title = args.title as string;
  const description = args.description as string | undefined;
  const priority = (args.priority as string) ?? "medium";
  const dueDate = args.due_date as string | undefined;
  await db.insert(chores).values({
    title, description, priority, dueDate,
    createdByClerkUserId: clerkUserId,
    status: "todo",
  });
  return { name: "add_chore", success: true, summary: `Chore created: "${title}" (${priority} priority)` };
}

async function execGetChores(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const statusFilter = (args.status as string) ?? "todo";
  const limit = (args.limit as number) ?? 10;
  let rows;
  if (statusFilter === "all") {
    rows = await db.select().from(chores).orderBy(desc(chores.createdAt)).limit(limit);
  } else {
    rows = await db.select().from(chores).where(eq(chores.status, statusFilter)).orderBy(desc(chores.createdAt)).limit(limit);
  }
  const summary = rows.length === 0
    ? `No ${statusFilter} chores.`
    : rows.map(c => `• [${c.priority}] ${c.title}${c.dueDate ? ` (due ${c.dueDate})` : ""}`).join("\n");
  return { name: "get_chores", success: true, summary, data: rows };
}

async function execCompleteChore(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const titleQuery = (args.chore_title as string ?? "").toLowerCase();
  const rows = await db.select().from(chores).where(eq(chores.status, "todo"));
  const match = rows.find(c => c.title.toLowerCase().includes(titleQuery));
  if (!match) return { name: "complete_chore", success: false, summary: `Could not find chore "${args.chore_title}".` };
  await db.update(chores).set({ status: "done", updatedAt: new Date() }).where(eq(chores.id, match.id));
  return { name: "complete_chore", success: true, summary: `Marked chore "${match.title}" as done! ✅` };
}

async function execAddCalendarEvent(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const title = args.title as string;
  const startAt = new Date(args.start_at as string);
  const endAt = args.end_at ? new Date(args.end_at as string) : undefined;
  const notes = args.notes as string | undefined;
  if (isNaN(startAt.getTime())) return { name: "add_calendar_event", success: false, summary: "Invalid start date/time." };
  await db.insert(familyEvents).values({ clerkUserId, title, startAt, endAt, notes });
  return { name: "add_calendar_event", success: true, summary: `Calendar event added: "${title}" on ${startAt.toLocaleString()}` };
}

async function execGetCalendarEvents(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const daysAhead = (args.days_ahead as number) ?? 14;
  const limit = (args.limit as number) ?? 10;
  const now = new Date();
  const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const rows = await db.select().from(familyEvents)
    .where(and(
      eq(familyEvents.clerkUserId, clerkUserId),
      gte(familyEvents.startAt, now),
      lte(familyEvents.startAt, until),
    ))
    .orderBy(familyEvents.startAt)
    .limit(limit);
  const summary = rows.length === 0
    ? `No events in the next ${daysAhead} days.`
    : rows.map(e => `• ${e.title} — ${new Date(e.startAt).toLocaleString()}`).join("\n");
  return { name: "get_calendar_events", success: true, summary, data: rows };
}

async function execAddBudgetEntry(
  clerkUserId: string,
  args: Args,
  context?: { originalMessage?: string },
): Promise<ToolResultEvent> {
  // Confidence gate: if the triggering message matched a budget pattern with
  // LOW confidence the AI was already told to ask the user for confirmation.
  // Block the actual DB insert so nothing is silently recorded.
  if (context?.originalMessage && isBudgetEntryBlockedByConfidence(context.originalMessage)) {
    return {
      name: "add_budget_entry",
      success: false,
      summary:
        "Budget entry not recorded — the intent was ambiguous. " +
        "The user needs to confirm the amount and category before this can be logged.",
    };
  }

  const type = args.type as string;
  const amount = String(args.amount as number);
  const category = (args.category as string) ?? "Other";
  const description = (args.description as string) ?? "";
  const entryDate = (args.entry_date as string) ?? new Date().toISOString().slice(0, 10);
  await db.insert(budgetEntries).values({ clerkUserId, type, amount, category, description, entryDate });
  const sign = type === "income" ? "+" : "-";
  return { name: "add_budget_entry", success: true, summary: `Recorded ${type}: ${sign}${args.amount} for ${category}${description ? ` (${description})` : ""}` };
}

async function execGetBudgetSummary(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const now = new Date();
  const year = (args.year as number) ?? now.getFullYear();
  const month = (args.month as number) ?? (now.getMonth() + 1);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const rows = await db.select().from(budgetEntries)
    .where(and(
      eq(budgetEntries.clerkUserId, clerkUserId),
      gte(budgetEntries.entryDate, start),
      lte(budgetEntries.entryDate, end),
    ));
  let income = 0, expenses = 0;
  const byCat: Record<string, number> = {};
  for (const e of rows) {
    const amt = parseFloat(e.amount as string);
    if (e.type === "income") income += amt; else expenses += amt;
    byCat[e.category] = (byCat[e.category] ?? 0) + amt;
  }
  const categoryLines = Object.entries(byCat).map(([c, a]) => `  ${c}: $${a.toFixed(2)}`).join("\n");
  const summary = rows.length === 0
    ? `No entries for ${year}-${String(month).padStart(2, "0")}.`
    : `Budget for ${year}-${String(month).padStart(2, "0")}:\n  Income: $${income.toFixed(2)}\n  Expenses: $${expenses.toFixed(2)}\n  Net: $${(income - expenses).toFixed(2)}\n\nBy category:\n${categoryLines}`;
  return { name: "get_budget_summary", success: true, summary, data: { income, expenses, net: income - expenses, entries: rows } };
}

async function execCreateNote(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const title = args.title as string;
  const body = (args.body as string) ?? "";
  await db.insert(familyNotes).values({ clerkUserId, title, body });
  return { name: "create_note", success: true, summary: `Note created: "${title}"` };
}

async function execGetNotes(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const search = args.search as string | undefined;
  const limit = (args.limit as number) ?? 10;
  let rows;
  if (search) {
    rows = await db.select().from(familyNotes)
      .where(and(eq(familyNotes.clerkUserId, clerkUserId), ilike(familyNotes.title, `%${search}%`)))
      .orderBy(desc(familyNotes.updatedAt)).limit(limit);
    if (rows.length === 0) {
      rows = await db.select().from(familyNotes)
        .where(and(eq(familyNotes.clerkUserId, clerkUserId), ilike(familyNotes.body, `%${search}%`)))
        .orderBy(desc(familyNotes.updatedAt)).limit(limit);
    }
  } else {
    rows = await db.select().from(familyNotes)
      .where(eq(familyNotes.clerkUserId, clerkUserId))
      .orderBy(desc(familyNotes.updatedAt)).limit(limit);
  }
  const summary = rows.length === 0
    ? "No notes found."
    : rows.map(n => `• ${n.title}: ${(n.body ?? "").slice(0, 60)}...`).join("\n");
  return { name: "get_notes", success: true, summary, data: rows };
}

async function execAddPantryItem(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const name = args.name as string;
  const quantity = args.quantity as string | undefined;
  const category = (args.category as string) ?? "other";
  const expiresAt = args.expires_at ? new Date(args.expires_at as string) : undefined;
  await db.insert(pantryItems).values({ clerkUserId, name, quantity, category, expiresAt });
  return { name: "add_pantry_item", success: true, summary: `Added "${name}" to pantry${quantity ? ` (${quantity})` : ""}` };
}

async function execGetPantry(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const category = args.category as string | undefined;
  const limit = (args.limit as number) ?? 20;
  let rows;
  if (category) {
    rows = await db.select().from(pantryItems).where(and(eq(pantryItems.clerkUserId, clerkUserId), eq(pantryItems.category, category))).limit(limit);
  } else {
    rows = await db.select().from(pantryItems).where(eq(pantryItems.clerkUserId, clerkUserId)).limit(limit);
  }
  const summary = rows.length === 0
    ? "Pantry is empty."
    : rows.map(p => `• ${p.name}${p.quantity ? ` (${p.quantity})` : ""}${p.category ? ` [${p.category}]` : ""}`).join("\n");
  return { name: "get_pantry", success: true, summary, data: rows };
}

async function execGetFamilyMembers(_clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const members = await db.select().from(familyMembers).where(eq(familyMembers.status, "approved"));
  const summary = members.map(m => `• ${m.displayName ?? m.email ?? m.clerkUserId} (${m.role})`).join("\n");
  return { name: "get_family_members", success: true, summary, data: members };
}

async function execSendFamilyMessage(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const toName = (args.to_name as string ?? "").toLowerCase();
  const message = args.message as string;
  const members = await db.select().from(familyMembers).where(eq(familyMembers.status, "approved"));
  const recipient = members.find(m =>
    (m.displayName ?? "").toLowerCase().includes(toName) ||
    (m.email ?? "").toLowerCase().includes(toName)
  );
  if (!recipient) return { name: "send_family_message", success: false, summary: `Could not find family member named "${args.to_name}".` };
  if (recipient.clerkUserId === clerkUserId) return { name: "send_family_message", success: false, summary: "Cannot send a message to yourself." };
  await db.insert(familyMessages).values({
    fromClerkUserId: clerkUserId,
    toClerkUserId: recipient.clerkUserId,
    content: message,
    isAiRelay: true,
  });
  return { name: "send_family_message", success: true, summary: `Message sent to ${recipient.displayName ?? recipient.email}: "${message}"` };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export interface ToolContext {
  /** The original user message that triggered this agentic turn. Used by
   *  write-path tools to enforce server-side confidence gates. */
  originalMessage?: string;
}

export async function executeTool(
  clerkUserId: string,
  name: string,
  args: Args,
  context?: ToolContext,
): Promise<ToolResultEvent> {
  try {
    switch (name) {
      case "add_shopping_items":      return await execAddShoppingItems(clerkUserId, args);
      case "get_shopping_list":       return await execGetShoppingList(clerkUserId, args);
      case "check_off_shopping_item": return await execCheckOffShoppingItem(clerkUserId, args);
      case "add_reminder":            return await execAddReminder(clerkUserId, args);
      case "get_reminders":           return await execGetReminders(clerkUserId, args);
      case "add_chore":               return await execAddChore(clerkUserId, args);
      case "get_chores":              return await execGetChores(clerkUserId, args);
      case "complete_chore":          return await execCompleteChore(clerkUserId, args);
      case "add_calendar_event":      return await execAddCalendarEvent(clerkUserId, args);
      case "get_calendar_events":     return await execGetCalendarEvents(clerkUserId, args);
      case "add_budget_entry":        return await execAddBudgetEntry(clerkUserId, args, context);
      case "get_budget_summary":      return await execGetBudgetSummary(clerkUserId, args);
      case "create_note":             return await execCreateNote(clerkUserId, args);
      case "get_notes":               return await execGetNotes(clerkUserId, args);
      case "add_pantry_item":         return await execAddPantryItem(clerkUserId, args);
      case "get_pantry":              return await execGetPantry(clerkUserId, args);
      case "get_family_members":      return await execGetFamilyMembers(clerkUserId, args);
      case "send_family_message":     return await execSendFamilyMessage(clerkUserId, args);
      default:
        return { name, success: false, summary: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { name, success: false, summary: `Tool error: ${err?.message ?? String(err)}` };
  }
}
