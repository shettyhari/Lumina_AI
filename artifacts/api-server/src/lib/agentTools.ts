/**
 * Agentic tool definitions and executors for Lina AI.
 * Gemini function-calling declarations + server-side DB executors.
 */

import { randomUUID } from "node:crypto";
import {
  db, shoppingItems, chores, reminders, familyEvents, budgetEntries, familyNotes, familyMembers, familyMessages,
  pantryItems, automations, documentFiles, homeSettings, users, bills, mealPlans, pets, petCareLogs, homeInventory,
  maintenanceTasks, choreRewards, rewardRedemptions, wishlists,
} from "@workspace/db";
import { eq, and, or, gte, lte, desc, ilike, inArray } from "drizzle-orm";
import { isBudgetEntryBlockedByConfidence } from "./intentDetector.js";
import { parseReceiptDocument, ReceiptParseError } from "./receiptParsing.js";
import { computeNextRunAt, type AutomationSchedule } from "./automationSchedule.js";
import { getCrossModuleStats } from "./crossModuleStats.js";
import { ai } from "@workspace/integrations-gemini-ai";
import { getHomeAssistantConfig, listEntities, controlEntity, HomeAssistantError } from "./homeAssistant.js";
import { fetchWeatherBriefing } from "./weather.js";
import { sendStatusBriefingEmail } from "./email.js";
import { parseGroceryPhoto, GroceryPhotoParseError } from "./groceryPhotoParsing.js";
import { syncGoogleCalendarEvents, GoogleCalendarError } from "./googleCalendar.js";

const AUTOMATABLE_TOOLS = new Set([
  "add_reminder", "add_chore", "add_calendar_event", "add_shopping_items", "create_note",
  "send_family_message", "generate_weekly_insight", "control_smart_home_device", "send_status_briefing_email",
]);

// Shared confirm-before-acting gate: used for consequential actions (large
// budget entries, deletions). Fires while the triggering message contains no
// confirmation language — once the user replies "yes"/"confirm"/"delete it"
// etc., the call goes through, since that reply typically won't re-match
// whatever originally triggered the gate (a dollar figure, a delete verb).
const CONFIRMATION_WORDS = /\b(yes|yep|yeah|confirm(ed)?|correct|go ahead|do it|log it|delete it|remove it|that'?s right|sounds right|please do)\b/i;

function needsConfirmation(originalMessage?: string): boolean {
  return !originalMessage || !CONFIRMATION_WORDS.test(originalMessage);
}

// Kid Mode (a family-member featureFlag, set in Admin) blocks a family
// member's session from financial, deletion, smart-home-control, and
// scheduling tools — same restriction the admin dashboard's toggle grants,
// just enforced here too so it also covers chat/voice, not only the
// module UIs a restricted member might not even see a link to.
const RESTRICTED_TOOLS = new Set([
  "add_budget_entry", "get_budget_summary", "parse_receipt_image",
  "control_smart_home_device",
  "delete_reminder", "delete_chore", "delete_calendar_event",
  "create_automation",
  "add_bill", "get_bills",
  "send_status_briefing_email",
]);

async function isKidModeRestricted(clerkUserId: string): Promise<boolean> {
  try {
    const [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));
    if (!member) return false;
    const flags = JSON.parse(member.featureFlags || "{}") as Record<string, boolean>;
    return flags.kidMode === true;
  } catch {
    return false; // never let a lookup failure block a normal action
  }
}

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
  {
    name: "delete_reminder",
    description: "Delete a reminder. Confirm with the user which one before calling this if there's any ambiguity.",
    parameters: {
      type: "object",
      properties: {
        message_query: { type: "string", description: "Text to match against the reminder's message (partial match ok)" },
      },
      required: ["message_query"],
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
  {
    name: "delete_chore",
    description: "Delete a chore entirely (not the same as completing it).",
    parameters: {
      type: "object",
      properties: {
        chore_title: { type: "string", description: "Title of the chore to delete (partial match ok)" },
      },
      required: ["chore_title"],
    },
  },
  // Calendar
  {
    name: "add_calendar_event",
    description: "Add an event to the family calendar. Set repeat for a recurring event ('every Monday', 'daily standup', etc.) — this creates several concrete occurrences, not an open-ended rule.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        start_at: { type: "string", description: "ISO 8601 start datetime (of the first occurrence, if repeating)" },
        end_at: { type: "string", description: "ISO 8601 end datetime (optional)" },
        notes: { type: "string", description: "Additional notes (optional)" },
        repeat: {
          type: "string",
          enum: ["none", "daily", "weekly", "monthly"],
          description: "Repeat frequency (default: none). Generates a bounded number of future occurrences: ~30 days for daily, ~12 weeks for weekly, ~6 months for monthly.",
        },
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
  {
    name: "sync_google_calendar",
    description: "Import upcoming events (next 60 days) from the user's connected Google Calendar into the family calendar. One-way only — events added in Lina are not pushed back to Google. Requires Google connected in Settings → Cloud Storage.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "delete_calendar_event",
    description: "Delete a calendar event. If it's part of a recurring series, deletes just that one occurrence unless delete_entire_series is set.",
    parameters: {
      type: "object",
      properties: {
        title_query: { type: "string", description: "Text to match against the event title (partial match ok)" },
        delete_entire_series: { type: "boolean", description: "If the matched event recurs, delete every occurrence in the series instead of just this one (default false)" },
      },
      required: ["title_query"],
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
        receipt_document_id: { type: "number", description: "Document id of an uploaded receipt image to link to this entry (from parse_receipt_image), optional" },
      },
      required: ["type", "amount", "category"],
    },
  },
  {
    name: "parse_receipt_image",
    description: "Read an already-uploaded receipt photo (by its document id) and extract the amount, merchant, category, date, and line items. Returns a DRAFT — present it to the user for confirmation before calling add_budget_entry with the same receipt_document_id.",
    parameters: {
      type: "object",
      properties: {
        document_file_id: { type: "number", description: "The id of the uploaded document (receipt photo)" },
      },
      required: ["document_file_id"],
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
  {
    name: "add_pantry_items_from_photo",
    description: "Read an already-uploaded photo of groceries (items on a counter, in bags) and add everything identifiable straight to the pantry. Unlike parse_receipt_image, this looks at the actual items in the photo, not a receipt's printed text — for a receipt, use parse_receipt_image instead.",
    parameters: {
      type: "object",
      properties: {
        document_file_id: { type: "number", description: "The id of the uploaded document (grocery photo)" },
      },
      required: ["document_file_id"],
    },
  },
  {
    name: "generate_weekly_insight",
    description: "Generate a short proactive insight covering budget, chores, pantry, and calendar status across the household. Most useful set up as a weekly automation, but can also be run on demand.",
    parameters: { type: "object", properties: {} },
  },
  // Automations
  {
    name: "create_automation",
    description: "Set up a recurring or one-time automation from a natural-language request, e.g. 'every Sunday remind everyone to take out the trash'. It will run on schedule even when no one is in the chat, performing the underlying action and posting a message about it.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short human-readable summary of what this automation does, for display in a list (e.g. 'Weekly trash reminder')" },
        tool_name: {
          type: "string",
          enum: ["add_reminder", "add_chore", "add_calendar_event", "add_shopping_items", "create_note", "send_family_message", "generate_weekly_insight", "control_smart_home_device", "send_status_briefing_email"],
          description: "Which existing tool to run on schedule",
        },
        tool_args: {
          type: "object",
          description: "The arguments to pass to tool_name, using that tool's own parameter names exactly (e.g. for add_reminder: {message, remind_at, repeat})",
        },
        schedule: {
          type: "object",
          properties: {
            freq: { type: "string", enum: ["once", "daily", "weekly"], description: "How often to run" },
            day_of_week: { type: "number", description: "0=Sunday..6=Saturday, required when freq is weekly" },
            time: { type: "string", description: "24-hour time to run at, HH:mm" },
            timezone: { type: "string", description: "IANA timezone (e.g. 'America/New_York'). Use the user's stated timezone, or ask if unknown." },
          },
          required: ["freq", "time", "timezone"],
        },
      },
      required: ["description", "tool_name", "tool_args", "schedule"],
    },
  },
  // Weather & status
  {
    name: "get_weather",
    description: "Get the current weather and 5-day forecast for the family's home city (from Settings), using real forecast data. Optionally pass a different city.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "Optional — city to check instead of the home city, e.g. 'Austin, TX'" },
      },
    },
  },
  {
    name: "get_status_briefing",
    description: "Give a full household status report — like asking \"status report\": today's weather, upcoming calendar events, open/overdue chores, bills due soon, budget snapshot, pantry items expiring soon, and a smart-home summary if connected. Use this for broad check-ins ('how are things looking', 'give me a rundown', 'status report'), not for a single specific question.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "send_status_briefing_email",
    description: "Email the full household status briefing to the user's account email. Use when the user asks to have the briefing emailed, or to set up a recurring morning digest via create_automation.",
    parameters: { type: "object", properties: {} },
  },
  // Bills
  {
    name: "add_bill",
    description: "Add a recurring monthly bill to track (rent, utilities, subscriptions, etc.).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Bill name, e.g. 'Electric' or 'Netflix'" },
        amount: { type: "number", description: "Amount in dollars" },
        due_day_of_month: { type: "number", description: "Day of the month it's due, 1-31" },
        category: { type: "string", description: "Category, e.g. utilities, rent, subscription, insurance (default: other)" },
        auto_pay: { type: "boolean", description: "Whether it's on autopay (default false)" },
      },
      required: ["name", "amount", "due_day_of_month"],
    },
  },
  {
    name: "get_bills",
    description: "List the household's active recurring bills.",
    parameters: { type: "object", properties: {} },
  },
  // Meal planning
  {
    name: "plan_meal",
    description: "Add a dish to the meal plan for a specific day and slot.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        meal_slot: { type: "string", enum: ["breakfast", "lunch", "dinner"], description: "Which meal" },
        dish_name: { type: "string", description: "What's being made" },
        notes: { type: "string", description: "Optional notes, e.g. recipe link" },
      },
      required: ["date", "meal_slot", "dish_name"],
    },
  },
  {
    name: "get_meal_plan",
    description: "Get the meal plan for a date range (defaults to the current week).",
    parameters: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "How many days ahead to include, from today (default 7)" },
      },
    },
  },
  {
    name: "sync_meal_plan_to_shopping_list",
    description: "Look at the planned meals and current pantry, then add the likely-missing grocery items to the shopping list. Ingredients are AI-inferred from dish names (the meal plan doesn't store ingredient lists), so tell the user this is a best-effort list they should double-check.",
    parameters: {
      type: "object",
      properties: {
        days_ahead: { type: "number", description: "How many days of the meal plan to shop for (default 7)" },
      },
    },
  },
  // Pets
  {
    name: "get_pets",
    description: "List the household's pets.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "log_pet_care",
    description: "Log a care event for a pet — feeding, walk, medication, vet visit, grooming, etc.",
    parameters: {
      type: "object",
      properties: {
        pet_name: { type: "string", description: "Name of the pet (partial match ok)" },
        type: { type: "string", description: "Type of care, e.g. 'fed', 'walked', 'medication', 'vet visit'" },
        notes: { type: "string", description: "Optional details" },
      },
      required: ["pet_name", "type"],
    },
  },
  // Home inventory
  {
    name: "add_inventory_item",
    description: "Add an item to the home inventory (appliances, electronics, furniture) — useful for tracking warranties and value.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Item name" },
        category: { type: "string", description: "Category, e.g. appliance, electronics, furniture (default: appliance)" },
        brand: { type: "string", description: "Optional brand" },
        location: { type: "string", description: "Optional location in the home" },
        warranty_expiry: { type: "string", description: "Optional ISO date the warranty expires" },
        purchase_price: { type: "number", description: "Optional purchase price in dollars" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_inventory",
    description: "List home inventory items, optionally filtered by category. Useful for 'when does X's warranty expire' questions.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category filter" },
      },
    },
  },
  // Home maintenance
  {
    name: "add_maintenance_task",
    description: "Add a recurring or one-off home maintenance task (HVAC service, gutter cleaning, filter changes, etc.).",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        category: { type: "string", description: "Category, e.g. HVAC, plumbing, exterior (default: general)" },
        interval_days: { type: "number", description: "Optional — how often it repeats, in days" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_maintenance_tasks",
    description: "List home maintenance tasks, ordered by what's due soonest.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "complete_maintenance_task",
    description: "Mark a maintenance task as done today, advancing its next-due date if it recurs.",
    parameters: {
      type: "object",
      properties: {
        task_title: { type: "string", description: "Title of the task (partial match ok)" },
      },
      required: ["task_title"],
    },
  },
  // Chore rewards
  {
    name: "get_reward_balance",
    description: "Get a family member's chore-reward point balance (10 points per completed chore, minus spent redemptions).",
    parameters: {
      type: "object",
      properties: {
        member_name: { type: "string", description: "Whose balance — defaults to the current user if omitted" },
      },
    },
  },
  {
    name: "redeem_reward",
    description: "Request redemption of a reward with points. Creates a pending request that a parent/admin must approve — points aren't deducted until approved.",
    parameters: {
      type: "object",
      properties: {
        reward_title: { type: "string", description: "Name of the reward (partial match ok)" },
      },
      required: ["reward_title"],
    },
  },
  // Wishlist
  {
    name: "add_wishlist_item",
    description: "Add an item to the current user's gift wishlist.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Item name" },
        price: { type: "number", description: "Optional price in dollars" },
        url: { type: "string", description: "Optional link to the item" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Default: medium" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_wishlist",
    description: "Get a family member's wishlist (defaults to the current user).",
    parameters: {
      type: "object",
      properties: {
        member_name: { type: "string", description: "Whose wishlist — defaults to the current user if omitted" },
      },
    },
  },
  // Smart Home (Home Assistant)
  {
    name: "get_smart_home_devices",
    description: "List the user's Home Assistant smart-home devices and their current state (on/off, temperature, brightness, etc.). Requires the user to have connected Home Assistant in Settings.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Optional filter by device type, e.g. 'light', 'switch', 'climate', 'lock', 'cover', 'fan', 'sensor'. Omit to list everything.",
        },
      },
    },
  },
  {
    name: "get_family_locations",
    description: "Show where family members currently are (home, away, or a named place) via Home Assistant person/device_tracker entities. Requires Home Assistant connected in Settings, and the user's Home Assistant to actually have person/device tracking set up.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "control_smart_home_device",
    description: "Control a Home Assistant smart-home device (turn lights/switches on or off, set thermostat temperature, dim lights, lock/unlock, open/close covers). Call get_smart_home_devices first if you don't already know the exact entity_id.",
    parameters: {
      type: "object",
      properties: {
        entity_id: { type: "string", description: "The Home Assistant entity id, e.g. 'light.living_room' or 'climate.thermostat' (from get_smart_home_devices)" },
        action: {
          type: "string",
          enum: ["turn_on", "turn_off", "toggle", "set_temperature", "set_brightness", "lock", "unlock", "open", "close"],
          description: "What to do to the device",
        },
        value: { type: "number", description: "Required for set_temperature (degrees) and set_brightness (0-100 percent). Omit otherwise." },
      },
      required: ["entity_id", "action"],
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

async function execDeleteReminder(clerkUserId: string, args: Args, context?: ToolContext): Promise<ToolResultEvent> {
  const query = (args.message_query as string ?? "").toLowerCase();
  const rows = await db.select().from(reminders).where(eq(reminders.clerkUserId, clerkUserId));
  const match = rows.find(r => r.message.toLowerCase().includes(query));
  if (!match) return { name: "delete_reminder", success: false, summary: `Could not find a reminder matching "${args.message_query}".` };
  if (needsConfirmation(context?.originalMessage)) {
    return { name: "delete_reminder", success: false, summary: `Confirm with the user before deleting the reminder "${match.message}", then call delete_reminder again.` };
  }
  await db.delete(reminders).where(eq(reminders.id, match.id));
  return { name: "delete_reminder", success: true, summary: `Deleted reminder: "${match.message}"` };
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

async function execDeleteChore(_clerkUserId: string, args: Args, context?: ToolContext): Promise<ToolResultEvent> {
  const titleQuery = (args.chore_title as string ?? "").toLowerCase();
  const rows = await db.select().from(chores);
  const match = rows.find(c => c.title.toLowerCase().includes(titleQuery));
  if (!match) return { name: "delete_chore", success: false, summary: `Could not find chore "${args.chore_title}".` };
  if (needsConfirmation(context?.originalMessage)) {
    return { name: "delete_chore", success: false, summary: `Confirm with the user before deleting the chore "${match.title}", then call delete_chore again.` };
  }
  await db.delete(chores).where(eq(chores.id, match.id));
  return { name: "delete_chore", success: true, summary: `Deleted chore: "${match.title}"` };
}

// Recurrence is materialized as concrete rows over a bounded horizon rather
// than an open-ended rule — far simpler to query/delete/display than
// re-deriving occurrences everywhere familyEvents is read, at the cost of a
// series not extending itself forever (a fixed, generous horizon per
// frequency instead).
const RECURRENCE_HORIZON: Record<string, { stepDays?: number; stepMonths?: number; count: number }> = {
  daily: { stepDays: 1, count: 30 },
  weekly: { stepDays: 7, count: 12 },
  monthly: { stepMonths: 1, count: 6 },
};

function addRecurrenceStep(date: Date, freq: string): Date {
  const rule = RECURRENCE_HORIZON[freq];
  const next = new Date(date);
  if (rule.stepDays) next.setDate(next.getDate() + rule.stepDays);
  else if (rule.stepMonths) next.setMonth(next.getMonth() + rule.stepMonths);
  return next;
}

async function execAddCalendarEvent(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const title = args.title as string;
  const startAt = new Date(args.start_at as string);
  const endAt = args.end_at ? new Date(args.end_at as string) : undefined;
  const notes = args.notes as string | undefined;
  const repeat = (args.repeat as string) ?? "none";
  if (isNaN(startAt.getTime())) return { name: "add_calendar_event", success: false, summary: "Invalid start date/time." };
  if (repeat !== "none" && !RECURRENCE_HORIZON[repeat]) {
    return { name: "add_calendar_event", success: false, summary: "repeat must be none, daily, weekly, or monthly." };
  }

  if (repeat === "none") {
    // Conflict check: treat events with no end time as 1hr for comparison
    // purposes only (never persisted) — same visibility scope as
    // execGetCalendarEvents (shared family calendar, see routes/calendar).
    const effectiveEnd = endAt ?? new Date(startAt.getTime() + 60 * 60 * 1000);
    const dayBefore = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
    const dayAfter = new Date(effectiveEnd.getTime() + 24 * 60 * 60 * 1000);
    const nearby = await db.select().from(familyEvents)
      .where(and(gte(familyEvents.startAt, dayBefore), lte(familyEvents.startAt, dayAfter)));
    const conflict = nearby.find((e) => {
      const eStart = new Date(e.startAt).getTime();
      const eEnd = e.endAt ? new Date(e.endAt).getTime() : eStart + 60 * 60 * 1000;
      return eStart < effectiveEnd.getTime() && eEnd > startAt.getTime();
    });

    await db.insert(familyEvents).values({ clerkUserId, title, startAt, endAt, notes, repeat: "none" });
    const base = `Calendar event added: "${title}" on ${startAt.toLocaleString()}`;
    return conflict
      ? { name: "add_calendar_event", success: true, summary: `${base}. Heads up — this overlaps with "${conflict.title}" at ${new Date(conflict.startAt).toLocaleString()}.` }
      : { name: "add_calendar_event", success: true, summary: base };
  }

  // Recurring: materialize occurrences over the bounded horizon. No
  // per-occurrence conflict check — with up to 30 instances that's a lot of
  // noise for a case the user can already see by asking for the calendar.
  const durationMs = endAt ? endAt.getTime() - startAt.getTime() : null;
  const { count } = RECURRENCE_HORIZON[repeat];
  const recurrenceGroupId = randomUUID();
  const rows: (typeof familyEvents.$inferInsert)[] = [];
  let occurrenceStart = startAt;
  for (let i = 0; i < count; i++) {
    rows.push({
      clerkUserId,
      title,
      startAt: occurrenceStart,
      endAt: durationMs != null ? new Date(occurrenceStart.getTime() + durationMs) : undefined,
      notes,
      repeat,
      recurrenceGroupId,
    });
    occurrenceStart = addRecurrenceStep(occurrenceStart, repeat);
  }
  await db.insert(familyEvents).values(rows);
  return {
    name: "add_calendar_event",
    success: true,
    summary: `Recurring calendar event added: "${title}", ${repeat}, starting ${startAt.toLocaleString()} — ${count} occurrences scheduled.`,
  };
}

async function execGetCalendarEvents(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const daysAhead = (args.days_ahead as number) ?? 14;
  const limit = (args.limit as number) ?? 10;
  const now = new Date();
  const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  // Calendar is shared across the whole family (see routes/calendar/index.ts
  // GET /calendar, which has no clerkUserId filter) — don't scope to just
  // this user or events other members added would go unreported.
  const rows = await db.select().from(familyEvents)
    .where(and(
      gte(familyEvents.startAt, now),
      lte(familyEvents.startAt, until),
    ))
    .orderBy(familyEvents.startAt)
    .limit(limit);
  const summary = rows.length === 0
    ? `No events in the next ${daysAhead} days.`
    : rows.map(e => `• ${e.title} — ${new Date(e.startAt).toLocaleString()}${e.repeat && e.repeat !== "none" ? ` (repeats ${e.repeat})` : ""}`).join("\n");
  return { name: "get_calendar_events", success: true, summary, data: rows };
}

async function execSyncGoogleCalendar(clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  try {
    const result = await syncGoogleCalendarEvents(clerkUserId);
    if (result.imported === 0 && result.updated === 0) {
      return { name: "sync_google_calendar", success: true, summary: `Synced with Google Calendar — everything was already up to date (${result.skipped} event(s) unchanged).` };
    }
    return { name: "sync_google_calendar", success: true, summary: `Synced with Google Calendar: ${result.imported} new event(s) imported, ${result.updated} updated.` };
  } catch (err) {
    if (err instanceof GoogleCalendarError) return { name: "sync_google_calendar", success: false, summary: err.message };
    return { name: "sync_google_calendar", success: false, summary: "Google Calendar sync failed." };
  }
}

async function execDeleteCalendarEvent(_clerkUserId: string, args: Args, context?: ToolContext): Promise<ToolResultEvent> {
  const titleQuery = (args.title_query as string ?? "").toLowerCase();
  const deleteSeries = (args.delete_entire_series as boolean) ?? false;
  // Shared family calendar — same unscoped visibility as execGetCalendarEvents.
  const rows = await db.select().from(familyEvents);
  const match = rows.find(e => e.title.toLowerCase().includes(titleQuery));
  if (!match) return { name: "delete_calendar_event", success: false, summary: `Could not find an event matching "${args.title_query}".` };

  if (deleteSeries && match.recurrenceGroupId) {
    if (needsConfirmation(context?.originalMessage)) {
      return { name: "delete_calendar_event", success: false, summary: `Confirm with the user before deleting the entire "${match.title}" series, then call delete_calendar_event again.` };
    }
    const seriesRows = rows.filter(e => e.recurrenceGroupId === match.recurrenceGroupId);
    await db.delete(familyEvents).where(eq(familyEvents.recurrenceGroupId, match.recurrenceGroupId));
    return { name: "delete_calendar_event", success: true, summary: `Deleted all ${seriesRows.length} occurrences of "${match.title}".` };
  }

  if (needsConfirmation(context?.originalMessage)) {
    return { name: "delete_calendar_event", success: false, summary: `Confirm with the user before deleting "${match.title}" (${new Date(match.startAt).toLocaleString()}), then call delete_calendar_event again.` };
  }
  await db.delete(familyEvents).where(eq(familyEvents.id, match.id));
  return { name: "delete_calendar_event", success: true, summary: `Deleted event: "${match.title}"${match.recurrenceGroupId ? " (just this occurrence — the rest of the series is untouched)" : ""}` };
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
  if (!["income", "expense"].includes(type)) {
    return { name: "add_budget_entry", success: false, summary: "type must be income or expense." };
  }
  const amountNum = Number(args.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return { name: "add_budget_entry", success: false, summary: "amount must be a positive number." };
  }

  // Large-amount gate: same shape as the confidence gate above, but keyed on
  // size rather than ambiguity — see needsConfirmation() for how the
  // confirmation-language bypass works.
  const LARGE_AMOUNT_THRESHOLD = 500;
  if (amountNum >= LARGE_AMOUNT_THRESHOLD && needsConfirmation(context?.originalMessage)) {
    return {
      name: "add_budget_entry",
      success: false,
      summary:
        `This is a large ${type} ($${amountNum.toFixed(2)}) — confirm the amount and category with the user before logging it. ` +
        `Call add_budget_entry again once they confirm.`,
    };
  }

  const amount = String(amountNum.toFixed(2));
  const category = (args.category as string) ?? "Other";
  const description = (args.description as string) ?? "";
  const entryDate = (args.entry_date as string) ?? new Date().toISOString().slice(0, 10);

  let receiptDocumentId: number | null = null;
  if (args.receipt_document_id != null) {
    const parsedId = Number(args.receipt_document_id);
    if (isNaN(parsedId)) return { name: "add_budget_entry", success: false, summary: "receipt_document_id must be a number." };
    const [doc] = await db.select().from(documentFiles).where(eq(documentFiles.id, parsedId));
    if (!doc || doc.clerkUserId !== clerkUserId) {
      return { name: "add_budget_entry", success: false, summary: "That receipt image wasn't found." };
    }
    receiptDocumentId = parsedId;
  }

  await db.insert(budgetEntries).values({ clerkUserId, type, amount, category, description, entryDate, receiptDocumentId });
  const sign = type === "income" ? "+" : "-";
  return { name: "add_budget_entry", success: true, summary: `Recorded ${type}: ${sign}${amountNum} for ${category}${description ? ` (${description})` : ""}` };
}

async function execParseReceiptImage(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const documentFileId = Number(args.document_file_id);
  if (isNaN(documentFileId)) return { name: "parse_receipt_image", success: false, summary: "document_file_id is required." };
  try {
    const extraction = await parseReceiptDocument(clerkUserId, documentFileId);
    if (extraction.amount <= 0) {
      return { name: "parse_receipt_image", success: false, summary: "Could not read a total amount from that receipt image." };
    }
    const summary = `Draft from receipt: ${extraction.merchant ?? "Unknown merchant"} — $${extraction.amount.toFixed(2)} (${extraction.category})${extraction.date ? ` on ${extraction.date}` : ""}. Confirm with the user before logging it.`;
    return { name: "parse_receipt_image", success: true, summary, data: { documentFileId, ...extraction } };
  } catch (err) {
    if (err instanceof ReceiptParseError) return { name: "parse_receipt_image", success: false, summary: err.message };
    return { name: "parse_receipt_image", success: false, summary: "Failed to read that receipt image." };
  }
}

async function execGetBudgetSummary(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const now = new Date();
  const year = (args.year as number) ?? now.getFullYear();
  const month = (args.month as number) ?? (now.getMonth() + 1);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  // Budget is shared across the family (see routes/budget/index.ts
  // GET /budget/summary, unscoped) — don't exclude other members' entries.
  const rows = await db.select().from(budgetEntries)
    .where(and(
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
  // Notes are shared across the family (see routes/notes/index.ts GET
  // /notes, unscoped) — don't exclude notes other members wrote.
  let rows;
  if (search) {
    rows = await db.select().from(familyNotes)
      .where(ilike(familyNotes.title, `%${search}%`))
      .orderBy(desc(familyNotes.updatedAt)).limit(limit);
    if (rows.length === 0) {
      rows = await db.select().from(familyNotes)
        .where(ilike(familyNotes.body, `%${search}%`))
        .orderBy(desc(familyNotes.updatedAt)).limit(limit);
    }
  } else {
    rows = await db.select().from(familyNotes)
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

async function execAddPantryItemsFromPhoto(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const documentFileId = Number(args.document_file_id);
  if (isNaN(documentFileId)) return { name: "add_pantry_items_from_photo", success: false, summary: "document_file_id is required." };
  try {
    const extraction = await parseGroceryPhoto(clerkUserId, documentFileId);
    if (extraction.items.length === 0) {
      return { name: "add_pantry_items_from_photo", success: true, summary: "Couldn't identify any grocery items in that photo." };
    }
    for (const item of extraction.items) {
      await db.insert(pantryItems).values({ clerkUserId, name: item.name, quantity: item.quantity ?? undefined, category: item.category });
    }
    const summary = `Added ${extraction.items.length} item(s) from the photo to the pantry: ${extraction.items.map((i) => i.name).join(", ")}. Double-check quantities/categories, since these are AI-read from the image.`;
    return { name: "add_pantry_items_from_photo", success: true, summary, data: extraction.items };
  } catch (err) {
    if (err instanceof GroceryPhotoParseError) return { name: "add_pantry_items_from_photo", success: false, summary: err.message };
    return { name: "add_pantry_items_from_photo", success: false, summary: "Failed to read that grocery photo." };
  }
}

async function execGetWeather(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  let city = (args.city as string | undefined)?.trim();
  if (!city) {
    const [row] = await db.select().from(homeSettings).where(eq(homeSettings.key, "city")).limit(1);
    city = row?.value;
  }
  if (!city) {
    return { name: "get_weather", success: false, summary: "No home city is set. Add one in Settings → Home, or ask again with a specific city." };
  }
  try {
    const briefing = await fetchWeatherBriefing(city);
    return { name: "get_weather", success: true, summary: briefing.text, data: briefing };
  } catch (err) {
    return { name: "get_weather", success: false, summary: err instanceof Error ? err.message : "Couldn't fetch the weather right now." };
  }
}

export async function buildStatusBriefingText(clerkUserId: string): Promise<string> {
  const parts: string[] = [];

  const [cityRow] = await db.select().from(homeSettings).where(eq(homeSettings.key, "city")).limit(1);
  if (cityRow?.value) {
    try {
      const weather = await fetchWeatherBriefing(cityRow.value);
      parts.push(`Weather: ${weather.text}`);
    } catch { /* weather unavailable, skip */ }
  }

  const stats = await getCrossModuleStats(clerkUserId);
  if (stats) parts.push(stats);

  const haConfig = await getHomeAssistantConfig(clerkUserId);
  if (haConfig) {
    try {
      const entities = await listEntities(haConfig);
      const on = entities.filter((e) => e.state === "on");
      const climate = entities.filter((e) => e.entity_id.startsWith("climate."));
      const bits: string[] = [];
      if (on.length > 0) bits.push(`${on.length} device(s) on`);
      for (const c of climate) {
        const target = (c.attributes.temperature as number | undefined);
        if (target != null) bits.push(`${(c.attributes.friendly_name as string) ?? c.entity_id} set to ${target}°`);
      }
      if (bits.length > 0) parts.push(`Smart home: ${bits.join(", ")}.`);
    } catch { /* HA unreachable, skip */ }
  }

  return parts.length === 0
    ? "Nothing notable to report — no weather city set, and no household activity yet."
    : parts.join("\n");
}

async function execGetStatusBriefing(clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const summary = await buildStatusBriefingText(clerkUserId);
  return { name: "get_status_briefing", success: true, summary };
}

async function execSendStatusBriefingEmail(clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const [userRow] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  const to = userRow?.email;
  if (!to) {
    return { name: "send_status_briefing_email", success: false, summary: "No email address on file for this account." };
  }
  const briefingText = await buildStatusBriefingText(clerkUserId);
  try {
    await sendStatusBriefingEmail(to, briefingText);
    return { name: "send_status_briefing_email", success: true, summary: `Sent the status briefing to ${to}.` };
  } catch (err) {
    return { name: "send_status_briefing_email", success: false, summary: err instanceof Error ? err.message : "Failed to send the briefing email." };
  }
}

async function execAddBill(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const name = args.name as string;
  const amountNum = Number(args.amount);
  const dueDay = Number(args.due_day_of_month);
  if (isNaN(amountNum) || amountNum <= 0) return { name: "add_bill", success: false, summary: "amount must be a positive number." };
  if (isNaN(dueDay) || dueDay < 1 || dueDay > 31) return { name: "add_bill", success: false, summary: "due_day_of_month must be between 1 and 31." };
  await db.insert(bills).values({
    name,
    amountCents: Math.round(amountNum * 100),
    dueDayOfMonth: dueDay,
    category: (args.category as string) ?? "other",
    autoPay: (args.auto_pay as boolean) ?? false,
  });
  return { name: "add_bill", success: true, summary: `Bill added: "${name}" — $${amountNum.toFixed(2)}, due on day ${dueDay} of each month.` };
}

async function execGetBills(_clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const rows = await db.select().from(bills).where(eq(bills.isActive, true));
  const summary = rows.length === 0
    ? "No active bills tracked."
    : rows.map((b) => `• ${b.name} — $${(b.amountCents / 100).toFixed(2)}, due day ${b.dueDayOfMonth}${b.autoPay ? " (autopay)" : ""}`).join("\n");
  return { name: "get_bills", success: true, summary, data: rows };
}

function mealPlanAbsoluteDate(weekStart: string, dayOfWeek: number): Date {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + dayOfWeek);
  return d;
}

async function execPlanMeal(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const dateStr = args.date as string;
  const mealSlot = args.meal_slot as string;
  const dishName = args.dish_name as string;
  const notes = args.notes as string | undefined;
  const date = new Date(`${dateStr}T00:00:00`);
  if (isNaN(date.getTime())) return { name: "plan_meal", success: false, summary: "Invalid date." };

  const jsDay = date.getDay(); // 0=Sun..6=Sat
  const dayOfWeek = (jsDay + 6) % 7; // 0=Mon..6=Sun, matches mealPlans schema
  const weekStartDate = new Date(date);
  weekStartDate.setDate(date.getDate() - dayOfWeek);
  const weekStart = weekStartDate.toISOString().slice(0, 10);

  await db.insert(mealPlans).values({ clerkUserId, weekStart, dayOfWeek, mealSlot, dishName, notes });
  return { name: "plan_meal", success: true, summary: `Planned ${mealSlot} for ${date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${dishName}` };
}

async function execGetMealPlan(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const daysAhead = (args.days_ahead as number) ?? 7;
  const now = new Date();
  const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const rows = await db.select().from(mealPlans).where(eq(mealPlans.clerkUserId, clerkUserId));
  const inRange = rows
    .map((r) => ({ ...r, absoluteDate: mealPlanAbsoluteDate(r.weekStart, r.dayOfWeek) }))
    .filter((r) => r.absoluteDate >= new Date(now.toISOString().slice(0, 10)) && r.absoluteDate <= until)
    .sort((a, b) => a.absoluteDate.getTime() - b.absoluteDate.getTime());

  const summary = inRange.length === 0
    ? `No meals planned in the next ${daysAhead} days.`
    : inRange.map((r) => `• ${r.absoluteDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${r.mealSlot}: ${r.dishName}`).join("\n");
  return { name: "get_meal_plan", success: true, summary, data: inRange };
}

async function execSyncMealPlanToShoppingList(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const daysAhead = (args.days_ahead as number) ?? 7;
  const now = new Date();
  const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const rows = await db.select().from(mealPlans).where(eq(mealPlans.clerkUserId, clerkUserId));
  const dishes = rows
    .map((r) => ({ ...r, absoluteDate: mealPlanAbsoluteDate(r.weekStart, r.dayOfWeek) }))
    .filter((r) => r.absoluteDate >= new Date(now.toISOString().slice(0, 10)) && r.absoluteDate <= until)
    .map((r) => r.dishName);

  if (dishes.length === 0) {
    return { name: "sync_meal_plan_to_shopping_list", success: true, summary: `No meals planned in the next ${daysAhead} days — nothing to shop for.` };
  }

  const pantryRows = await db.select().from(pantryItems).where(eq(pantryItems.clerkUserId, clerkUserId));
  const pantryNames = pantryRows.map((p) => p.name);

  const prompt = `Planned dishes for the next ${daysAhead} days: ${dishes.join(", ")}.\n` +
    `Already in the pantry: ${pantryNames.length > 0 ? pantryNames.join(", ") : "(nothing recorded)"}.\n\n` +
    `List the grocery items likely needed to make these dishes that are NOT already in the pantry. ` +
    `Keep it practical — common ingredients only, no exotic substitutions, no duplicates, no items already in the pantry list above. ` +
    `Respond ONLY with a JSON array of short item names, e.g. ["ground beef","spaghetti","parmesan"]. Max 15 items.`;

  let items: string[] = [];
  try {
    const result = await ai.models.generateContent({ model: "gemini-flash-latest", contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const raw = result.text?.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim() ?? "[]";
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) items = parsed.filter((i): i is string => typeof i === "string").slice(0, 15);
  } catch {
    return { name: "sync_meal_plan_to_shopping_list", success: false, summary: "Couldn't work out what's needed for the meal plan right now — try again shortly." };
  }

  if (items.length === 0) {
    return { name: "sync_meal_plan_to_shopping_list", success: true, summary: "Looks like the pantry already covers everything needed for the planned meals." };
  }

  for (const name of items) {
    await db.insert(shoppingItems).values({ clerkUserId, name: name.trim(), category: "Other" }).onConflictDoNothing();
  }
  return {
    name: "sync_meal_plan_to_shopping_list",
    success: true,
    summary: `Added ${items.length} AI-suggested item(s) to the shopping list for this week's meal plan: ${items.join(", ")}. Double-check against the actual recipes.`,
  };
}

async function execGetPets(_clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const rows = await db.select().from(pets);
  const summary = rows.length === 0
    ? "No pets on file."
    : rows.map((p) => `• ${p.avatarEmoji} ${p.name} (${p.species}${p.breed ? `, ${p.breed}` : ""})`).join("\n");
  return { name: "get_pets", success: true, summary, data: rows };
}

async function execLogPetCare(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const nameQuery = (args.pet_name as string ?? "").toLowerCase();
  const type = args.type as string;
  const notes = args.notes as string | undefined;
  const allPets = await db.select().from(pets);
  const match = allPets.find((p) => p.name.toLowerCase().includes(nameQuery));
  if (!match) return { name: "log_pet_care", success: false, summary: `Could not find a pet named "${args.pet_name}".` };
  await db.insert(petCareLogs).values({ petId: match.id, clerkUserId, type, notes });
  return { name: "log_pet_care", success: true, summary: `Logged "${type}" for ${match.name}.` };
}

async function execAddInventoryItem(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const name = args.name as string;
  const price = args.purchase_price != null ? Number(args.purchase_price) : undefined;
  await db.insert(homeInventory).values({
    name,
    category: (args.category as string) ?? "appliance",
    brand: args.brand as string | undefined,
    location: args.location as string | undefined,
    warrantyExpiry: args.warranty_expiry ? new Date(args.warranty_expiry as string) : undefined,
    purchasePriceCents: price != null && !isNaN(price) ? Math.round(price * 100) : undefined,
  });
  return { name: "add_inventory_item", success: true, summary: `Added "${name}" to home inventory.` };
}

async function execGetInventory(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const category = args.category as string | undefined;
  const rows = category
    ? await db.select().from(homeInventory).where(eq(homeInventory.category, category))
    : await db.select().from(homeInventory);
  const summary = rows.length === 0
    ? "No inventory items found."
    : rows.map((i) => `• ${i.name}${i.brand ? ` (${i.brand})` : ""}${i.warrantyExpiry ? ` — warranty until ${new Date(i.warrantyExpiry).toLocaleDateString()}` : ""}`).join("\n");
  return { name: "get_inventory", success: true, summary, data: rows };
}

async function execAddMaintenanceTask(_clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const title = args.title as string;
  const intervalDays = args.interval_days != null ? Number(args.interval_days) : undefined;
  const nextDueAt = intervalDays != null && !isNaN(intervalDays) ? new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000) : undefined;
  await db.insert(maintenanceTasks).values({
    title,
    category: (args.category as string) ?? "general",
    intervalDays: intervalDays != null && !isNaN(intervalDays) ? intervalDays : undefined,
    nextDueAt,
  });
  return { name: "add_maintenance_task", success: true, summary: `Maintenance task added: "${title}"${nextDueAt ? `, next due ${nextDueAt.toLocaleDateString()}` : ""}.` };
}

async function execGetMaintenanceTasks(_clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const rows = await db.select().from(maintenanceTasks).orderBy(maintenanceTasks.nextDueAt);
  const summary = rows.length === 0
    ? "No maintenance tasks tracked."
    : rows.map((t) => `• ${t.title}${t.nextDueAt ? ` — due ${new Date(t.nextDueAt).toLocaleDateString()}` : ""}`).join("\n");
  return { name: "get_maintenance_tasks", success: true, summary, data: rows };
}

async function execCompleteMaintenanceTask(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const titleQuery = (args.task_title as string ?? "").toLowerCase();
  const rows = await db.select().from(maintenanceTasks);
  const match = rows.find((t) => t.title.toLowerCase().includes(titleQuery));
  if (!match) return { name: "complete_maintenance_task", success: false, summary: `Could not find maintenance task "${args.task_title}".` };
  const now = new Date();
  const nextDueAt = match.intervalDays ? new Date(now.getTime() + match.intervalDays * 24 * 60 * 60 * 1000) : null;
  await db.update(maintenanceTasks).set({ lastDoneAt: now, lastDoneBy: clerkUserId, nextDueAt }).where(eq(maintenanceTasks.id, match.id));
  return { name: "complete_maintenance_task", success: true, summary: `Marked "${match.title}" as done.${nextDueAt ? ` Next due ${nextDueAt.toLocaleDateString()}.` : ""}` };
}

async function resolveMemberClerkId(clerkUserId: string, memberName?: string): Promise<string> {
  if (!memberName) return clerkUserId;
  const members = await db.select().from(familyMembers);
  const match = members.find((m) => (m.displayName ?? "").toLowerCase().includes(memberName.toLowerCase()));
  return match?.clerkUserId ?? clerkUserId;
}

async function execGetRewardBalance(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const targetId = await resolveMemberClerkId(clerkUserId, args.member_name as string | undefined);
  const [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, targetId));
  const completedChores = await db.select().from(chores).where(and(eq(chores.status, "done"), eq(chores.assignedToClerkUserId, targetId)));
  const approvedRedemptions = await db.select().from(rewardRedemptions).where(and(eq(rewardRedemptions.clerkUserId, targetId), eq(rewardRedemptions.status, "approved")));
  const POINTS_PER_CHORE = 10;
  const earned = completedChores.length * POINTS_PER_CHORE;
  const spent = approvedRedemptions.reduce((acc, r) => acc + r.pointsSpent, 0);
  const who = member?.displayName ?? "This member";
  return { name: "get_reward_balance", success: true, summary: `${who} has ${earned - spent} point(s) (${earned} earned, ${spent} spent).` };
}

async function execRedeemReward(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const titleQuery = (args.reward_title as string ?? "").toLowerCase();
  const rewards = await db.select().from(choreRewards).where(eq(choreRewards.isActive, true));
  const match = rewards.find((r) => r.title.toLowerCase().includes(titleQuery));
  if (!match) return { name: "redeem_reward", success: false, summary: `Could not find an active reward matching "${args.reward_title}".` };
  await db.insert(rewardRedemptions).values({ rewardId: match.id, clerkUserId, pointsSpent: match.pointCost });
  return { name: "redeem_reward", success: true, summary: `Requested "${match.title}" for ${match.pointCost} points — pending a parent/admin's approval.` };
}

async function execAddWishlistItem(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const title = args.title as string;
  const price = args.price != null ? Number(args.price) : undefined;
  await db.insert(wishlists).values({
    clerkUserId,
    title,
    url: args.url as string | undefined,
    priority: (args.priority as string) ?? "medium",
    priceCents: price != null && !isNaN(price) ? Math.round(price * 100) : undefined,
  });
  return { name: "add_wishlist_item", success: true, summary: `Added "${title}" to the wishlist.` };
}

async function execGetWishlist(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const targetId = await resolveMemberClerkId(clerkUserId, args.member_name as string | undefined);
  const rows = await db.select().from(wishlists).where(eq(wishlists.clerkUserId, targetId));
  const summary = rows.length === 0
    ? "No items on this wishlist."
    : rows.map((w) => `• ${w.title}${w.priceCents ? ` — $${(w.priceCents / 100).toFixed(2)}` : ""}${w.isClaimed ? " (claimed)" : ""}`).join("\n");
  return { name: "get_wishlist", success: true, summary, data: rows };
}

async function execGetSmartHomeDevices(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const config = await getHomeAssistantConfig(clerkUserId);
  if (!config) {
    return { name: "get_smart_home_devices", success: false, summary: "Home Assistant isn't connected yet. Add your Home Assistant URL and a long-lived access token in Settings → Smart Home." };
  }
  try {
    const domain = args.domain as string | undefined;
    const entities = await listEntities(config, domain);
    if (entities.length === 0) {
      return { name: "get_smart_home_devices", success: true, summary: domain ? `No ${domain} devices found.` : "No devices found." };
    }
    const summary = entities
      .slice(0, 40)
      .map((e) => `• ${(e.attributes.friendly_name as string) ?? e.entity_id} (${e.entity_id}): ${e.state}`)
      .join("\n");
    return { name: "get_smart_home_devices", success: true, summary, data: entities };
  } catch (err) {
    if (err instanceof HomeAssistantError) return { name: "get_smart_home_devices", success: false, summary: err.message };
    throw err;
  }
}

function describeLocationState(state: string): string {
  if (state === "home") return "home";
  if (state === "not_home") return "away";
  return state; // a named zone, e.g. "Work", "School"
}

async function execGetFamilyLocations(clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const config = await getHomeAssistantConfig(clerkUserId);
  if (!config) {
    return { name: "get_family_locations", success: false, summary: "Home Assistant isn't connected yet. Add your Home Assistant URL and a long-lived access token in Settings → Smart Home." };
  }
  try {
    let entities = await listEntities(config, "person");
    if (entities.length === 0) entities = await listEntities(config, "device_tracker");
    if (entities.length === 0) {
      return { name: "get_family_locations", success: true, summary: "Home Assistant isn't tracking any person or device_tracker entities — nothing to report." };
    }
    const summary = entities
      .map((e) => `• ${(e.attributes.friendly_name as string) ?? e.entity_id} is ${describeLocationState(e.state)}`)
      .join("\n");
    return { name: "get_family_locations", success: true, summary, data: entities };
  } catch (err) {
    if (err instanceof HomeAssistantError) return { name: "get_family_locations", success: false, summary: err.message };
    throw err;
  }
}

async function execControlSmartHomeDevice(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const config = await getHomeAssistantConfig(clerkUserId);
  if (!config) {
    return { name: "control_smart_home_device", success: false, summary: "Home Assistant isn't connected yet. Add your Home Assistant URL and a long-lived access token in Settings → Smart Home." };
  }
  const entityId = args.entity_id as string;
  const action = args.action as string;
  const value = args.value != null ? Number(args.value) : undefined;
  if (!entityId || !action) {
    return { name: "control_smart_home_device", success: false, summary: "entity_id and action are required." };
  }
  try {
    await controlEntity(config, entityId, action, value);
    return { name: "control_smart_home_device", success: true, summary: `Done — ${action.replace(/_/g, " ")} on ${entityId}${value != null ? ` (${value})` : ""}.` };
  } catch (err) {
    if (err instanceof HomeAssistantError) return { name: "control_smart_home_device", success: false, summary: err.message };
    throw err;
  }
}

// Matches routes/family/index.ts GET /family/members visibility: a freshly
// self-approved admin has status "pending" but should still be visible.
async function execGetFamilyMembers(_clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const members = await db.select().from(familyMembers)
    .where(or(eq(familyMembers.status, "approved"), eq(familyMembers.role, "admin")));
  const summary = members.map(m => `• ${m.displayName ?? m.email ?? m.clerkUserId} (${m.role})`).join("\n");
  return { name: "get_family_members", success: true, summary, data: members };
}

async function execSendFamilyMessage(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const toName = (args.to_name as string ?? "").toLowerCase();
  const message = args.message as string;
  const members = await db.select().from(familyMembers)
    .where(or(eq(familyMembers.status, "approved"), eq(familyMembers.role, "admin")));
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

async function execGenerateWeeklyInsight(clerkUserId: string, _args: Args): Promise<ToolResultEvent> {
  const stats = await getCrossModuleStats(clerkUserId);
  if (!stats) {
    return { name: "generate_weekly_insight", success: true, summary: "No budget, chore, pantry, or calendar activity to report on yet." };
  }
  const prompt = `You are a household AI assistant. Here is this household's current status:\n\n${stats}\n\nWrite a short (2-3 sentence) proactive weekly insight highlighting what's most worth the user's attention, with a specific suggestion if relevant. Be warm and specific, not generic.`;
  try {
    const result = await ai.models.generateContent({ model: "gemini-flash-latest", contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const summary = result.candidates?.[0]?.content?.parts?.[0]?.text ?? stats;
    return { name: "generate_weekly_insight", success: true, summary };
  } catch {
    return { name: "generate_weekly_insight", success: true, summary: `This week: ${stats}` };
  }
}

async function execCreateAutomation(clerkUserId: string, args: Args): Promise<ToolResultEvent> {
  const description = (args.description as string ?? "").trim();
  const toolName = args.tool_name as string;
  const toolArgs = (args.tool_args as Record<string, unknown>) ?? {};
  const scheduleArgs = (args.schedule as Args) ?? {};

  if (!description) return { name: "create_automation", success: false, summary: "A description is required." };
  if (!AUTOMATABLE_TOOLS.has(toolName)) {
    return { name: "create_automation", success: false, summary: `"${toolName}" can't be automated. Choose one of: ${[...AUTOMATABLE_TOOLS].join(", ")}.` };
  }

  const freq = scheduleArgs.freq as string;
  const time = scheduleArgs.time as string;
  const timezone = (scheduleArgs.timezone as string) || "UTC";
  const dayOfWeek = scheduleArgs.day_of_week as number | undefined;
  if (!["once", "daily", "weekly"].includes(freq) || !time || !/^\d{2}:\d{2}$/.test(time)) {
    return { name: "create_automation", success: false, summary: "Schedule needs a valid freq (once/daily/weekly) and time (HH:mm)." };
  }
  if (freq === "weekly" && (dayOfWeek == null || dayOfWeek < 0 || dayOfWeek > 6)) {
    return { name: "create_automation", success: false, summary: "Weekly automations need a day_of_week (0=Sunday..6=Saturday)." };
  }

  const schedule: AutomationSchedule = { freq: freq as AutomationSchedule["freq"], time, timezone, ...(dayOfWeek != null ? { dayOfWeek } : {}) };
  const nextRunAt = computeNextRunAt(schedule);
  await db.insert(automations).values({ clerkUserId, description, toolName, toolArgs, schedule, nextRunAt });

  return {
    name: "create_automation",
    success: true,
    summary: `Automation set up: "${description}" — will run ${freq}${freq === "weekly" ? ` on ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dayOfWeek!]}` : ""} at ${time} (${timezone}). First run: ${nextRunAt.toLocaleString()}.`,
  };
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
    if (RESTRICTED_TOOLS.has(name) && (await isKidModeRestricted(clerkUserId))) {
      return { name, success: false, summary: "That's not available on this account — ask a parent or admin." };
    }
    switch (name) {
      case "add_shopping_items":      return await execAddShoppingItems(clerkUserId, args);
      case "get_shopping_list":       return await execGetShoppingList(clerkUserId, args);
      case "check_off_shopping_item": return await execCheckOffShoppingItem(clerkUserId, args);
      case "add_reminder":            return await execAddReminder(clerkUserId, args);
      case "get_reminders":           return await execGetReminders(clerkUserId, args);
      case "delete_reminder":         return await execDeleteReminder(clerkUserId, args, context);
      case "add_chore":               return await execAddChore(clerkUserId, args);
      case "get_chores":              return await execGetChores(clerkUserId, args);
      case "complete_chore":          return await execCompleteChore(clerkUserId, args);
      case "delete_chore":             return await execDeleteChore(clerkUserId, args, context);
      case "add_calendar_event":      return await execAddCalendarEvent(clerkUserId, args);
      case "get_calendar_events":     return await execGetCalendarEvents(clerkUserId, args);
      case "delete_calendar_event":   return await execDeleteCalendarEvent(clerkUserId, args, context);
      case "sync_google_calendar":    return await execSyncGoogleCalendar(clerkUserId, args);
      case "add_budget_entry":        return await execAddBudgetEntry(clerkUserId, args, context);
      case "parse_receipt_image":     return await execParseReceiptImage(clerkUserId, args);
      case "get_budget_summary":      return await execGetBudgetSummary(clerkUserId, args);
      case "create_note":             return await execCreateNote(clerkUserId, args);
      case "get_notes":               return await execGetNotes(clerkUserId, args);
      case "add_pantry_item":         return await execAddPantryItem(clerkUserId, args);
      case "get_pantry":              return await execGetPantry(clerkUserId, args);
      case "add_pantry_items_from_photo": return await execAddPantryItemsFromPhoto(clerkUserId, args);
      case "get_weather":              return await execGetWeather(clerkUserId, args);
      case "get_status_briefing":     return await execGetStatusBriefing(clerkUserId, args);
      case "send_status_briefing_email": return await execSendStatusBriefingEmail(clerkUserId, args);
      case "add_bill":                return await execAddBill(clerkUserId, args);
      case "get_bills":                return await execGetBills(clerkUserId, args);
      case "plan_meal":                return await execPlanMeal(clerkUserId, args);
      case "get_meal_plan":            return await execGetMealPlan(clerkUserId, args);
      case "sync_meal_plan_to_shopping_list": return await execSyncMealPlanToShoppingList(clerkUserId, args);
      case "get_pets":                  return await execGetPets(clerkUserId, args);
      case "log_pet_care":             return await execLogPetCare(clerkUserId, args);
      case "add_inventory_item":      return await execAddInventoryItem(clerkUserId, args);
      case "get_inventory":            return await execGetInventory(clerkUserId, args);
      case "add_maintenance_task":    return await execAddMaintenanceTask(clerkUserId, args);
      case "get_maintenance_tasks":   return await execGetMaintenanceTasks(clerkUserId, args);
      case "complete_maintenance_task": return await execCompleteMaintenanceTask(clerkUserId, args);
      case "get_reward_balance":      return await execGetRewardBalance(clerkUserId, args);
      case "redeem_reward":            return await execRedeemReward(clerkUserId, args);
      case "add_wishlist_item":       return await execAddWishlistItem(clerkUserId, args);
      case "get_wishlist":             return await execGetWishlist(clerkUserId, args);
      case "get_smart_home_devices": return await execGetSmartHomeDevices(clerkUserId, args);
      case "get_family_locations":   return await execGetFamilyLocations(clerkUserId, args);
      case "control_smart_home_device": return await execControlSmartHomeDevice(clerkUserId, args);
      case "get_family_members":      return await execGetFamilyMembers(clerkUserId, args);
      case "send_family_message":     return await execSendFamilyMessage(clerkUserId, args);
      case "create_automation":       return await execCreateAutomation(clerkUserId, args);
      case "generate_weekly_insight": return await execGenerateWeeklyInsight(clerkUserId, args);
      default:
        return { name, success: false, summary: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { name, success: false, summary: `Tool error: ${err?.message ?? String(err)}` };
  }
}
