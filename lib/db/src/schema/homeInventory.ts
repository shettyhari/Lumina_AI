import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const homeInventory = pgTable("home_inventory", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("appliance"),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  purchasedAt: timestamp("purchased_at"),
  purchasePriceCents: integer("purchase_price_cents"),
  warrantyExpiry: timestamp("warranty_expiry"),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
