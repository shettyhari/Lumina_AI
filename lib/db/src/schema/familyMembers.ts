import { pgTable, serial, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const familyMembers = pgTable("family_members", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  role: text("role").notNull().default("member"), // "admin" | "member"
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  storageQuotaBytes: integer("storage_quota_bytes").notNull().default(104857600), // 100 MB
  storageUsedBytes: integer("storage_used_bytes").notNull().default(0),
  // JSON string: { imageGen, voiceChat, personas, memories }
  featureFlags: text("feature_flags").notNull().default('{"imageGen":true,"voiceChat":true,"personas":true,"memories":true}'),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => [
  // DB-level guarantee: only one admin can ever exist.
  // This partial unique index makes the application-level transaction race-proof:
  // if two concurrent sign-ups both pass the "no admin yet" check, the second
  // INSERT will fail with a unique-constraint error rather than silently creating a second admin.
  uniqueIndex("family_members_single_admin_idx")
    .on(table.role)
    .where(sql`${table.role} = 'admin'`),
]);

export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = typeof familyMembers.$inferInsert;
