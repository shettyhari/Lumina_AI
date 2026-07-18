import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";

export const budgetEntries = pgTable("budget_entries", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  type: text("type").notNull(), // income | expense
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  category: text("category").notNull().default("Other"),
  description: text("description").default(""),
  entryDate: date("entry_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BudgetEntry = typeof budgetEntries.$inferSelect;
export type InsertBudgetEntry = typeof budgetEntries.$inferInsert;
