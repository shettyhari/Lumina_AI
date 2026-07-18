import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueDayOfMonth: integer("due_day_of_month").notNull(),
  category: text("category").notNull().default("other"),
  autoPay: boolean("auto_pay").notNull().default(false),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
