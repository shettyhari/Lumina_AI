import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const documentFiles = pgTable("document_files", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  folder: text("folder").notNull().default("personal"), // personal | family
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(), // objectPath from GCS
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DocumentFile = typeof documentFiles.$inferSelect;
export type InsertDocumentFile = typeof documentFiles.$inferInsert;
