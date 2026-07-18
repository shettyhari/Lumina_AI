import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiMemories = pgTable("ai_memories", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAiMemorySchema = createInsertSchema(aiMemories).omit({
  id: true,
  createdAt: true,
});

export type AiMemory = typeof aiMemories.$inferSelect;
export type InsertAiMemory = z.infer<typeof insertAiMemorySchema>;
