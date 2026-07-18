import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const emergencyContacts = pgTable("emergency_contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  phone: text("phone").notNull(),
  notes: text("notes"),
  priority: integer("priority").notNull().default(10), // lower = higher priority
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmergencyContact = typeof emergencyContacts.$inferSelect;
export type InsertEmergencyContact = typeof emergencyContacts.$inferInsert;
