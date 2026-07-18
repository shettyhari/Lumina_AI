import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const shoppingItems = pgTable("shopping_items", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  quantity: text("quantity").default("1"),
  category: text("category").default("Other"),
  isChecked: boolean("is_checked").notNull().default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type InsertShoppingItem = typeof shoppingItems.$inferInsert;
