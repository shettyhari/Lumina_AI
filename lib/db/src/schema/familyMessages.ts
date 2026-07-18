import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const familyMessages = pgTable("family_messages", {
  id: serial("id").primaryKey(),
  fromClerkUserId: text("from_clerk_user_id").notNull(),
  toClerkUserId: text("to_clerk_user_id"), // null = broadcast
  content: text("content").notNull(),
  isAiRelay: boolean("is_ai_relay").notNull().default(false),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FamilyMessage = typeof familyMessages.$inferSelect;
export type InsertFamilyMessage = typeof familyMessages.$inferInsert;
