import { Router, type IRouter } from "express";
import { eq, count, sql } from "drizzle-orm";
import { db, users, conversations, messages } from "@workspace/db";
import {
  GetUserProfileResponse,
  UpdateUserProfileBody,
  UpdateUserProfileResponse,
  GetUserStatsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

// Helper: get or create user profile
async function getOrCreateUser(clerkUserId: string) {
  let [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  if (!user) {
    [user] = await db.insert(users).values({ clerkUserId }).returning();
  }
  return user;
}

router.get("/user/profile", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const user = await getOrCreateUser(clerkUserId);
  res.json(GetUserProfileResponse.parse(user));
});

router.patch("/user/profile", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const parsed = UpdateUserProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await getOrCreateUser(clerkUserId);

  const updateData: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
  if (parsed.data.preferredModel !== undefined) updateData.preferredModel = parsed.data.preferredModel;
  if (parsed.data.systemPrompt !== undefined) updateData.systemPrompt = parsed.data.systemPrompt;
  if (parsed.data.theme !== undefined) updateData.theme = parsed.data.theme;

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.clerkUserId, clerkUserId))
    .returning();

  res.json(UpdateUserProfileResponse.parse(updated));
});

router.get("/user/stats", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const user = await getOrCreateUser(clerkUserId);

  const [convCountResult] = await db
    .select({ count: count() })
    .from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId));

  const [msgCountResult] = await db
    .select({ count: count() })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.clerkUserId, clerkUserId));

  res.json(
    GetUserStatsResponse.parse({
      totalConversations: convCountResult?.count ?? 0,
      totalMessages: msgCountResult?.count ?? 0,
      imagesGenerated: user.imagesGenerated ?? 0,
      joinedAt: user.createdAt,
    }),
  );
});

export default router;
