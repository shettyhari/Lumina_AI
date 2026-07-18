import { pgTable, serial, text, date, integer, timestamp } from "drizzle-orm/pg-core";

export const mealPlans = pgTable("meal_plans", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  weekStart: date("week_start").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Mon … 6=Sun
  mealSlot: text("meal_slot").notNull(), // breakfast | lunch | dinner
  dishName: text("dish_name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MealPlan = typeof mealPlans.$inferSelect;
export type InsertMealPlan = typeof mealPlans.$inferInsert;
