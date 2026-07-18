import { Router, type IRouter } from "express";
import { eq, desc, gt, and } from "drizzle-orm";
import { db, familyMembers, familyMessages, familyRoomMessages } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

// Helper: enrich a room message with sender info
type MemberMap = Record<string, { displayName?: string | null; avatarUrl?: string | null }>;

function enrichRoomMsg(
  msg: typeof familyRoomMessages.$inferSelect,
  memberMap: MemberMap,
) {
  const m = msg.clerkUserId ? memberMap[msg.clerkUserId] : null;
  return {
    ...msg,
    senderName: msg.role === "assistant" ? "Lumina" : (m?.displayName ?? "Member"),
    senderAvatarUrl: msg.role === "assistant" ? null : (m?.avatarUrl ?? null),
  };
}

// ─── Family members list ──────────────────────────────────────────────────────

router.get("/family/members", requireAuth, async (req, res): Promise<void> => {
  const members = await db
    .select({
      clerkUserId: familyMembers.clerkUserId,
      displayName: familyMembers.displayName,
      avatarUrl: familyMembers.avatarUrl,
      email: familyMembers.email,
      role: familyMembers.role,
      status: familyMembers.status,
    })
    .from(familyMembers)
    .orderBy(familyMembers.createdAt);

  // Only return approved/admin members
  const visible = members.filter((m) => m.status === "approved" || m.role === "admin");
  res.json(visible);
});

// ─── Notifications (relay messages) ──────────────────────────────────────────

router.get("/family/notifications", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;

  const notes = await db
    .select()
    .from(familyMessages)
    .where(and(eq(familyMessages.toClerkUserId, clerkUserId), eq(familyMessages.isRead, false)))
    .orderBy(desc(familyMessages.createdAt));

  // Enrich with sender info
  const members = await db.select().from(familyMembers);
  const memberMap = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));

  const enriched = notes.map((n) => {
    const sender = memberMap[n.fromClerkUserId];
    return {
      id: n.id,
      fromClerkUserId: n.fromClerkUserId,
      fromName: sender?.displayName ?? sender?.email?.split("@")[0] ?? "Family Member",
      fromAvatarUrl: sender?.avatarUrl ?? null,
      content: n.content,
      isRead: n.isRead,
      createdAt: n.createdAt,
    };
  });

  res.json(enriched);
});

router.get("/family/notifications/count", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const notes = await db
    .select({ id: familyMessages.id })
    .from(familyMessages)
    .where(and(eq(familyMessages.toClerkUserId, clerkUserId), eq(familyMessages.isRead, false)));
  res.json({ count: notes.length });
});

router.patch("/family/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(familyMessages)
    .set({ isRead: true })
    .where(and(eq(familyMessages.id, id), eq(familyMessages.toClerkUserId, clerkUserId)));

  res.status(204).end();
});

router.patch("/family/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  await db
    .update(familyMessages)
    .set({ isRead: true })
    .where(and(eq(familyMessages.toClerkUserId, clerkUserId), eq(familyMessages.isRead, false)));
  res.status(204).end();
});

// ─── Family Room ──────────────────────────────────────────────────────────────

router.get("/family/room/messages", requireAuth, async (_req, res): Promise<void> => {
  const afterId = _req.query.after ? parseInt(_req.query.after as string) : null;
  const limit = 50;

  let msgs: typeof familyRoomMessages.$inferSelect[];
  if (afterId && !isNaN(afterId)) {
    msgs = await db
      .select()
      .from(familyRoomMessages)
      .where(gt(familyRoomMessages.id, afterId))
      .orderBy(familyRoomMessages.id)
      .limit(limit);
  } else {
    // Return most recent N messages in ascending order
    const recent = await db
      .select()
      .from(familyRoomMessages)
      .orderBy(desc(familyRoomMessages.id))
      .limit(limit);
    msgs = recent.reverse();
  }

  const members = await db.select().from(familyMembers);
  const memberMap = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));

  res.json(msgs.map((m) => enrichRoomMsg(m, memberMap)));
});

router.post("/family/room/messages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { content } = req.body ?? {};

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const members = await db.select().from(familyMembers);
  const memberMap = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));

  // Save user message
  const [userMsg] = await db
    .insert(familyRoomMessages)
    .values({ clerkUserId, content: content.trim(), role: "user" })
    .returning();

  // Check for @Lumina mention
  const hasLuminaMention = /@lumina\b/i.test(content);
  let aiMsg: typeof familyRoomMessages.$inferSelect | null = null;

  if (hasLuminaMention) {
    try {
      // Build recent room context for AI
      const recent = await db
        .select()
        .from(familyRoomMessages)
        .orderBy(desc(familyRoomMessages.id))
        .limit(20);

      const history = recent.reverse().map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [
          {
            text: m.clerkUserId
              ? `[${memberMap[m.clerkUserId]?.displayName ?? "Member"}]: ${m.content}`
              : m.content,
          },
        ],
      }));

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: history,
        config: {
          systemInstruction:
            "You are Lumina, a warm and helpful family AI assistant in a shared family chat room. Keep responses friendly, concise, and useful. Address the family member who mentioned you.",
          maxOutputTokens: 1024,
        },
      });

      const aiContent =
        result.candidates?.[0]?.content?.parts?.[0]?.text ??
        "I'm here! How can I help the family?";

      [aiMsg] = await db
        .insert(familyRoomMessages)
        .values({ clerkUserId: null, content: aiContent, role: "assistant" })
        .returning();
    } catch (_err) {
      // AI failed silently — still return user message
    }
  }

  res.status(201).json({
    message: enrichRoomMsg(userMsg, memberMap),
    aiMessage: aiMsg ? enrichRoomMsg(aiMsg, memberMap) : null,
  });
});

export default router;
