import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const pets = pgTable("pets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  species: text("species").notNull(),
  breed: text("breed"),
  birthday: timestamp("birthday"),
  avatarEmoji: text("avatar_emoji").notNull().default("🐾"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const petCareLogs = pgTable("pet_care_logs", {
  id: serial("id").primaryKey(),
  petId: integer("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  type: text("type").notNull(),
  notes: text("notes"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
