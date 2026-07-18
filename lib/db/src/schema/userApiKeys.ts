import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userApiKeys = pgTable("user_api_keys", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  provider: text("provider").notNull(), // openai | anthropic | openrouter
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;
