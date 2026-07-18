import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const familyNotes = pgTable("family_notes", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  title: text("title").notNull(),
  body: text("body").default(""),
  color: text("color").default("#fef08a"), // yellow sticky note default
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type FamilyNote = typeof familyNotes.$inferSelect;
export type InsertFamilyNote = typeof familyNotes.$inferInsert;
