import { pgTable, serial, text, date, timestamp } from "drizzle-orm/pg-core";

export const chores = pgTable("chores", {
  id: serial("id").primaryKey(),
  assignedToClerkUserId: text("assigned_to_clerk_user_id"),
  createdByClerkUserId: text("created_by_clerk_user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date"),
  priority: text("priority").notNull().default("medium"), // low | medium | high
  status: text("status").notNull().default("todo"), // todo | in_progress | done
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Chore = typeof chores.$inferSelect;
export type InsertChore = typeof chores.$inferInsert;
