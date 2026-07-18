import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const familyEvents = pgTable("family_events", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  title: text("title").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  notes: text("notes"),
  color: text("color").default("#6366f1"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FamilyEvent = typeof familyEvents.$inferSelect;
export type InsertFamilyEvent = typeof familyEvents.$inferInsert;
