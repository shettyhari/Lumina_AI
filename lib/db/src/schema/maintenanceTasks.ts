import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const maintenanceTasks = pgTable("maintenance_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  intervalDays: integer("interval_days"),
  lastDoneAt: timestamp("last_done_at"),
  lastDoneBy: text("last_done_by"),
  nextDueAt: timestamp("next_due_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
