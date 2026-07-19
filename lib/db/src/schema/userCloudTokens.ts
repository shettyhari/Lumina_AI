import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const userCloudTokens = pgTable("user_cloud_tokens", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  provider: text("provider").notNull(), // "google" | "dropbox" | "onedrive"
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  accountEmail: text("account_email"),
  accountName: text("account_name"),
  accountPicture: text("account_picture"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export type UserCloudToken = typeof userCloudTokens.$inferSelect;
