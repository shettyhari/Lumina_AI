import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const familyRoomMessages = pgTable("family_room_messages", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id"), // null for AI (Lumina) responses
  content: text("content").notNull(),
  role: text("role").notNull().default("user"), // "user" | "assistant"
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FamilyRoomMessage = typeof familyRoomMessages.$inferSelect;
export type InsertFamilyRoomMessage = typeof familyRoomMessages.$inferInsert;
