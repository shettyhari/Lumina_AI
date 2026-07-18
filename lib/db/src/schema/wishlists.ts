import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const wishlists = pgTable("wishlists", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  priceCents: integer("price_cents"),
  priority: text("priority").notNull().default("medium"),
  isClaimed: boolean("is_claimed").notNull().default(false),
  claimedBy: text("claimed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
