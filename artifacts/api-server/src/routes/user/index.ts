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
  try {
    let [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
    if (!user) {
      [user] = await db.insert(users).values({ clerkUserId }).returning();
    }
    return user;
  } catch {
    return {
      id: 1,
      clerkUserId,
      displayName: "Dev Admin",
      preferredModel: "gemini-2.5-flash",
      systemPrompt: null,
      theme: "dark",
      imagesGenerated: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
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
  const user = await getOrCreateUser(clerkUserId);
  const updateData: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) updateData.displayName = parsed.data.displayName;
  if (parsed.data.preferredModel !== undefined) updateData.preferredModel = parsed.data.preferredModel;
  if (parsed.data.systemPrompt !== undefined) updateData.systemPrompt = parsed.data.systemPrompt;
  if (parsed.data.theme !== undefined) updateData.theme = parsed.data.theme;
  let updated: any = { ...user, ...updateData };
  try {
    [updated] = await db.update(users).set(updateData).where(eq(users.clerkUserId, clerkUserId)).returning();
  } catch { /* DB fallback */ }
  res.json(UpdateUserProfileResponse.parse(updated));
});

router.get("/user/status", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { name, email, avatar } = req.query as Record<string, string | undefined>;

  let member: any = null;
  try {
    [member] = await db.select().from(familyMembers).where(eq(familyMembers.clerkUserId, clerkUserId));
  } catch {
    /* DB query fallback */
  }

  if (!member) {
    try {
      member = await db.transaction(async (tx) => {
        const [existingAdmin] = await tx.select().from(familyMembers).where(eq(familyMembers.role, "admin"));
        const isFirst = !existingAdmin;
        const [inserted] = await tx.insert(familyMembers).values({
          clerkUserId,
          role: isFirst ? "admin" : "member",
          status: isFirst ? "approved" : "pending",
          displayName: name ?? null,
          email: email ?? null,
          avatarUrl: avatar ?? null,
          featureFlags: '{"imageGen":true,"voiceChat":true,"personas":true,"memories":true}',
        }).returning();
        return inserted;
      });
    } catch {
      member = {
        clerkUserId,
        role: "admin",
        status: "approved",
        displayName: name ?? "Dev Admin",
        email: email ?? "admin@lumina.local",
        avatarUrl: avatar ?? null,
        storageQuotaBytes: 104857600,
        storageUsedBytes: 0,
        featureFlags: '{"imageGen":true,"voiceChat":true,"personas":true,"memories":true}',
      };
    }
  }

  let featureFlags: Record<string, boolean> = { imageGen: true, voiceChat: true, personas: true, memories: true };
  try { featureFlags = JSON.parse(member.featureFlags || "{}"); } catch { /* use default */ }

  res.json({
    status: member.status,
    role: member.role,
    isAdmin: member.role === "admin",
    storageQuotaBytes: member.storageQuotaBytes ?? 104857600,
    storageUsedBytes: member.storageUsedBytes ?? 0,
    featureFlags,
  });
});

router.get("/user/stats", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const user = await getOrCreateUser(clerkUserId);

  let convCount = { count: 0 };
  let msgCount = { count: 0 };
  let memCount = { count: 0 };
  let personaCount = { count: 0 };

  try {
    const res = await Promise.all([
      db.select({ count: count() }).from(conversations).where(eq(conversations.clerkUserId, clerkUserId)),
      db.select({ count: count() }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(eq(conversations.clerkUserId, clerkUserId)),
      db.select({ count: count() }).from(aiMemories).where(eq(aiMemories.clerkUserId, clerkUserId)),
      db.select({ count: count() }).from(aiPersonas).where(eq(aiPersonas.clerkUserId, clerkUserId)),
    ]);
    convCount = res[0][0] ?? convCount;
    msgCount = res[1][0] ?? msgCount;
    memCount = res[2][0] ?? memCount;
    personaCount = res[3][0] ?? personaCount;
  } catch { /* DB fallback */ }

  res.json(GetUserStatsResponse.parse({
    totalConversations: convCount?.count ?? 0,
    totalMessages: msgCount?.count ?? 0,
    imagesGenerated: user.imagesGenerated ?? 0,
    memoriesCount: memCount?.count ?? 0,
    personasCount: personaCount?.count ?? 0,
  }));
});

export default router;
