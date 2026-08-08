import { Router, type IRouter } from "express";
import { eq, desc, gt, and } from "drizzle-orm";
import { db, familyMembers, familyMessages, familyRoomMessages } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { requireAuth } from "../../middlewares/requireAuth";
import { TOOL_DECLARATIONS, executeTool } from "../../lib/agentTools";
import { logger } from "../../lib/logger";

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
    senderName: msg.role === "assistant" ? "Lina" : (m?.displayName ?? "Member"),
    senderAvatarUrl: msg.role === "assistant" ? null : (m?.avatarUrl ?? null),
  };
}

// ─── Family members list ──────────────────────────────────────────────────────

router.get("/family/members", requireAuth, async (req, res): Promise<void> => {
  let members: any[] = [];
  try {
    members = await db
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
  } catch {
    members = [];
  }

  // Only return approved/admin members
  const visible = members.filter((m) => m.status === "approved" || m.role === "admin");
  res.json(visible);
});

// ─── Notifications (relay messages) ──────────────────────────────────────────

router.get("/family/notifications", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;

  let notes: any[] = [];
  let members: any[] = [];
  try {
    notes = await db
      .select()
      .from(familyMessages)
      .where(and(eq(familyMessages.toClerkUserId, clerkUserId), eq(familyMessages.isRead, false)))
      .orderBy(desc(familyMessages.createdAt));
    members = await db.select().from(familyMembers);
  } catch {
    notes = [];
    members = [];
  }

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
  let notes: any[] = [];
  try {
    notes = await db
      .select({ id: familyMessages.id })
      .from(familyMessages)
      .where(and(eq(familyMessages.toClerkUserId, clerkUserId), eq(familyMessages.isRead, false)));
  } catch {
    notes = [];
  }
  res.json({ count: notes.length });
});

router.patch("/family/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    await db
      .update(familyMessages)
      .set({ isRead: true })
      .where(and(eq(familyMessages.id, id), eq(familyMessages.toClerkUserId, clerkUserId)));
  } catch { /* DB fallback */ }

  res.status(204).end();
});

router.patch("/family/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  try {
    await db
      .update(familyMessages)
      .set({ isRead: true })
      .where(and(eq(familyMessages.toClerkUserId, clerkUserId), eq(familyMessages.isRead, false)));
  } catch { /* DB fallback */ }
  res.status(204).end();
});

// ─── Family Room agentic reply ────────────────────────────────────────────────

/**
 * Runs the same tool-calling agent loop as the main chat (see
 * routes/gemini/index.ts's streamGeminiAgentic), but non-streaming: Family
 * Room messages are a single request/response, not SSE. Without this, "Lina"
 * in the family room was a plain generateContent() call with no tools at
 * all — it could only describe what it would do, never actually do it, so
 * "added milk to the shopping list" was pure hallucination.
 */
async function runFamilyRoomAgent(
  clerkUserId: string,
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  originalMessage: string,
  webSearch = true,
): Promise<string> {
  const systemInstruction = `You are Lina, an agentic AI assistant for a family, replying in their shared family chat room. You have access to tools that let you take real actions:
- Manage the shopping list (add items, check them off, view the list)
- Set and view reminders
- Manage chores (add, complete, list)
- Add and view calendar events
- Record budget entries and view spending summaries
- Create and search notes
- Manage the pantry inventory
- View family members and send direct messages to them${webSearch ? "\n- Search the web for current information (news, facts, anything you don't already know)" : ""}

When a family member asks you to do something you can accomplish with a tool, USE THE TOOL immediately — don't just describe what you would do, and never claim to have done something without actually calling the tool for it. After taking action, confirm what you did concisely. Keep replies warm, friendly, and brief.

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

  const contents: any[] = [...history];
  const toolsList: any[] = [{ functionDeclarations: TOOL_DECLARATIONS }];
  if (webSearch) toolsList.push({ googleSearch: {} });
  const config: Record<string, unknown> = {
    maxOutputTokens: 1024,
    systemInstruction,
    tools: toolsList,
  };

  const MAX_ITERATIONS = 6;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await ai.models.generateContent({ model: "gemini-flash-latest", contents, config });
    const parts: any[] = response.candidates?.[0]?.content?.parts ?? [];

    const funcCalls = parts.filter((p: any) => p.functionCall);
    const textParts = parts.filter((p: any) => p.text);

    if (funcCalls.length === 0) {
      const text = textParts.map((p: any) => p.text as string).join("");
      return text || "I'm here! How can I help the family?";
    }

    const funcResponseParts: any[] = [];
    for (const part of funcCalls) {
      const { name, args } = part.functionCall;
      const result = await executeTool(clerkUserId, name, args ?? {}, { originalMessage });
      funcResponseParts.push({
        functionResponse: { name, response: { output: result.summary, success: result.success } },
      });
    }

    contents.push({ role: "model", parts });
    contents.push({ role: "user", parts: funcResponseParts });
  }

  return "I've completed the requested actions.";
}

// ─── Family Room ──────────────────────────────────────────────────────────────

router.get("/family/room/messages", requireAuth, async (_req, res): Promise<void> => {
  const afterId = _req.query.after ? parseInt(_req.query.after as string) : null;
  const limit = 50;

  let msgs: any[] = [];
  try {
    if (afterId && !isNaN(afterId)) {
      msgs = await db
        .select()
        .from(familyRoomMessages)
        .where(gt(familyRoomMessages.id, afterId))
        .orderBy(familyRoomMessages.id)
        .limit(limit);
    } else {
      const recent = await db
        .select()
        .from(familyRoomMessages)
        .orderBy(desc(familyRoomMessages.id))
        .limit(limit);
      msgs = recent.reverse();
    }
  } catch {
    msgs = [];
  }

  let members: any[] = [];
  try {
    members = await db.select().from(familyMembers);
  } catch {
    members = [];
  }
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

  let members: any[] = [];
  try {
    members = await db.select().from(familyMembers);
  } catch {
    members = [];
  }
  const memberMap = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));

  let userMsg: any = null;
  try {
    [userMsg] = await db
      .insert(familyRoomMessages)
      .values({ clerkUserId, content: content.trim(), role: "user" })
      .returning();
  } catch {
    userMsg = {
      id: Date.now(),
      clerkUserId,
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
  }

  // Check for @Lina mention
  const hasLinaMention = /@lina\b/i.test(content);
  let aiMsg: typeof familyRoomMessages.$inferSelect | null = null;

  if (hasLinaMention) {
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

      let aiContent: string;
      try {
        aiContent = await runFamilyRoomAgent(clerkUserId, history, content.trim());
      } catch (err) {
        // Google Search grounding requires billing enabled on the
        // underlying Google Cloud project -- on a free-tier key it errors
        // out even for trivial requests. Retry without it so the family
        // still gets a real answer instead of nothing.
        logger.warn({ err }, "Family Room agent call failed — retrying without web search");
        aiContent = await runFamilyRoomAgent(clerkUserId, history, content.trim(), false);
      }

      [aiMsg] = await db
        .insert(familyRoomMessages)
        .values({ clerkUserId: null, content: aiContent, role: "assistant" })
        .returning();
    } catch (err) {
      logger.error({ err }, "Family Room agent error");
      // AI failed silently — still return user message
    }
  }

  res.status(201).json({
    message: enrichRoomMsg(userMsg, memberMap),
    aiMessage: aiMsg ? enrichRoomMsg(aiMsg, memberMap) : null,
  });
});

export default router;
