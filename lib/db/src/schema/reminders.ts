import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  message: text("message").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  repeat: text("repeat").default("none"), // none | daily | weekly
  isTriggered: boolean("is_triggered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;
