import { pgTable, serial, text, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";

export const automations = pgTable("automations", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  description: text("description").notNull(), // original natural-language request
  toolName: text("tool_name").notNull(), // e.g. "add_reminder", executed via the same tool dispatcher chat uses
  toolArgs: jsonb("tool_args").notNull().$type<Record<string, unknown>>(),
  // { freq: "once" | "daily" | "weekly", dayOfWeek?: 0-6, time: "HH:mm", timezone: string }
  schedule: jsonb("schedule").notNull().$type<{
    freq: "once" | "daily" | "weekly";
    dayOfWeek?: number;
    time: string;
    timezone: string;
  }>(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Automation = typeof automations.$inferSelect;
export type InsertAutomation = typeof automations.$inferInsert;
