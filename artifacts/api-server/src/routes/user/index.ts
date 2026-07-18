import { Router, type IRouter } from "express";
import { eq, count } from "drizzle-orm";
import { db, users, conversations, messages, aiMemories, aiPersonas, familyMembers } from "@workspace/db";
import {
  GetUserProfileResponse,
  UpdateUserProfileBody,
  UpdateUserProfileResponse,
  GetUserStatsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await getOrCreateUser(clerkUserId);
  const updateData: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
  if (parsed.data.preferredModel !== undefined) updateData.preferredModel = parsed.data.preferredModel;
  if (parsed.data.systemPrompt !== undefined) updateData.systemPrompt = parsed.data.systemPrompt;
  if (parsed.data.theme !== undefined) updateData.theme = parsed.data.theme;
  const [updated] = await db.update(users).set(updateData).where(eq(users.clerkUserId, clerkUserId)).returning();
  res.json(UpdateUserProfileResponse.parse(updated));
});

router.get("/user/status", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { name, email, avatar } = req.query as Record<string, string | undefined>;

  let [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));

  if (!member) {
    const [existingAdmin] = await db.select().from(familyMembers).where(eq(familyMembers.role, "admin"));
    const isFirst = !existingAdmin;
    [member] = await db.insert(familyMembers).values({
      clerkUserId,
      role: isFirst ? "admin" : "member",
      status: "approved",
      displayName: name ?? null,
      email: email ?? null,
      avatarUrl: avatar ?? null,
      featureFlags: '{"imageGen":true,"voiceChat":true,"personas":true,"memories":true}',
    }).returning();
  } else {
    // Auto-approve any previously pending member
    if (member.status !== "approved") {
      [member] = await db.update(familyMembers)
        .set({ status: "approved" })
        .where(eq(familyMembers.clerkUserId, clerkUserId))
        .returning();
    }
    // Update profile info if provided and not yet stored
    const updates: Record<string, unknown> = {};
    if (name && !member.displayName) updates.displayName = name;
    if (email && !member.email) updates.email = email;
    if (avatar && !member.avatarUrl) updates.avatarUrl = avatar;
    if (Object.keys(updates).length > 0) {
      [member] = await db.update(familyMembers).set(updates).where(eq(familyMembers.clerkUserId, clerkUserId)).returning();
    }
  }

  let featureFlags: Record<string, boolean> = { imageGen: true, voiceChat: true, personas: true, memories: true };
  try { featureFlags = JSON.parse(member.featureFlags || "{}"); } catch { /* use default */ }

  res.json({
    status: member.status,
    role: member.role,
    isAdmin: member.role === "admin",
    storageQuotaBytes: member.storageQuotaBytes,
    storageUsedBytes: member.storageUsedBytes,
    featureFlags,
  });
});

router.get("/user/stats", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const user = await getOrCreateUser(clerkUserId);

  const [[convCount], [msgCount], [memCount], [personaCount]] = await Promise.all([
    db.select({ count: count() }).from(conversations).where(eq(conversations.clerkUserId, clerkUserId)),
    db.select({ count: count() }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(eq(conversations.clerkUserId, clerkUserId)),
    db.select({ count: count() }).from(aiMemories).where(eq(aiMemories.clerkUserId, clerkUserId)),
    db.select({ count: count() }).from(aiPersonas).where(eq(aiPersonas.clerkUserId, clerkUserId)),
  ]);

  res.json(GetUserStatsResponse.parse({
    totalConversations: convCount?.count ?? 0,
    totalMessages: msgCount?.count ?? 0,
    imagesGenerated: user.imagesGenerated ?? 0,
    memoriesCount: memCount?.count ?? 0,
    personasCount: personaCount?.count ?? 0,
  }));
});

export default router;
