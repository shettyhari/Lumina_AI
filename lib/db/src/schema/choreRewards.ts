import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const choreRewards = pgTable("chore_rewards", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  pointCost: integer("point_cost").notNull(),
  emoji: text("emoji").notNull().default("🎁"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rewardRedemptions = pgTable("reward_redemptions", {
  id: serial("id").primaryKey(),
  rewardId: integer("reward_id").notNull().references(() => choreRewards.id),
  clerkUserId: text("clerk_user_id").notNull(),
  pointsSpent: integer("points_spent").notNull(),
  status: text("status").notNull().default("pending"),
  approvedBy: text("approved_by"),
  redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
});
