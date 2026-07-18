import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const pantryItems = pgTable("pantry_items", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  name: text("name").notNull(),
  quantity: text("quantity"),
  category: text("category").notNull().default("other"),
  expiresAt: timestamp("expires_at"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});
