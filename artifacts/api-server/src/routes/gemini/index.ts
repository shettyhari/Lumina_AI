import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, conversations, messages, users } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import {
  CreateGeminiConversationBody,
  GetGeminiConversationParams,
  UpdateGeminiConversationParams,
  UpdateGeminiConversationBody,
  DeleteGeminiConversationParams,
  ListGeminiMessagesParams,
  SendGeminiMessageParams,
  SendGeminiMessageBody,
  GenerateGeminiImageBody,
  ListGeminiConversationsResponse,
  GetGeminiConversationResponse,
  CreateGeminiConversationResponse,
  UpdateGeminiConversationResponse,
  ListGeminiMessagesResponse,
  GenerateGeminiImageResponse,
  GetRecentActivityResponse,
  GetPinnedConversationsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

// --- Conversations ---

router.get("/gemini/conversations", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId))
    .orderBy(desc(conversations.updatedAt));
  res.json(ListGeminiConversationsResponse.parse(convs));
});

router.post("/gemini/conversations", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const parsed = CreateGeminiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conv] = await db
    .insert(conversations)
    .values({ clerkUserId, title: parsed.data.title })
    .returning();
  res.status(201).json(CreateGeminiConversationResponse.parse(conv));
});

router.get("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = GetGeminiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv || conv.clerkUserId !== clerkUserId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);
  res.json(GetGeminiConversationResponse.parse({ ...conv, messages: msgs }));
});

router.patch("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = UpdateGeminiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateGeminiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!existing || existing.clerkUserId !== clerkUserId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.pinned !== undefined) updateData.pinned = parsed.data.pinned;

  const [updated] = await db
    .update(conversations)
    .set(updateData)
    .where(eq(conversations.id, params.data.id))
    .returning();
  res.json(UpdateGeminiConversationResponse.parse(updated));
});

router.delete("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = DeleteGeminiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!existing || existing.clerkUserId !== clerkUserId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  await db.delete(conversations).where(eq(conversations.id, params.data.id));
  res.sendStatus(204);
});

// --- Messages (SSE streaming) ---

router.get("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = ListGeminiMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv || conv.clerkUserId !== clerkUserId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);
  res.json(ListGeminiMessagesResponse.parse(msgs));
});

router.post("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = SendGeminiMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SendGeminiMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv || conv.clerkUserId !== clerkUserId) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // Get user profile for system prompt
  const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));

  // Save user message
  await db.insert(messages).values({
    conversationId: conv.id,
    role: "user",
    content: parsed.data.content,
  });

  // Load full message history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);

  const model = parsed.data.model ?? user?.preferredModel ?? "gemini-2.5-flash";
  const systemPrompt = parsed.data.systemPrompt ?? user?.systemPrompt ?? undefined;

  const chatMessages = history.map((m) => ({
    role: m.role === "assistant" ? "model" : ("user" as "model" | "user"),
    parts: [{ text: m.content }],
  }));

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const streamConfig: Record<string, unknown> = { maxOutputTokens: 8192 };
    if (systemPrompt) streamConfig.systemInstruction = systemPrompt;

    const stream = await ai.models.generateContentStream({
      model,
      contents: chatMessages,
      config: streamConfig,
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    // Save assistant message
    await db.insert(messages).values({
      conversationId: conv.id,
      role: "assistant",
      content: fullResponse,
    });

    // Update conversation message count and updatedAt
    await db
      .update(conversations)
      .set({
        messageCount: sql`${conversations.messageCount} + 2`,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conv.id));

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "Gemini streaming error");
    res.write(`data: ${JSON.stringify({ error: "AI generation failed" })}\n\n`);
  } finally {
    res.end();
  }
});

// --- Image Generation ---

router.post("/gemini/generate-image", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const parsed = GenerateGeminiImageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const { b64_json, mimeType } = await generateImage(parsed.data.prompt);
    // Increment user image count
    await db
      .update(users)
      .set({ imagesGenerated: sql`${users.imagesGenerated} + 1` })
      .where(eq(users.clerkUserId, clerkUserId));
    res.json(GenerateGeminiImageResponse.parse({ b64_json, mimeType }));
  } catch (err) {
    req.log.error({ err }, "Image generation failed");
    res.status(500).json({ error: "Image generation failed" });
  }
});

// --- Dashboard / Activity ---

router.get("/gemini/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const convs = await db
    .select()
    .from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId))
    .orderBy(desc(conversations.updatedAt))
    .limit(20);

  const activity = await Promise.all(
    convs.map(async (conv) => {
      const [lastMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      return {
        id: conv.id,
        title: conv.title,
        pinned: conv.pinned,
        lastMessage: lastMsg?.content?.slice(0, 100) ?? null,
        messageCount: conv.messageCount,
        updatedAt: conv.updatedAt,
      };
    }),
  );

  res.json(GetRecentActivityResponse.parse(activity));
});

router.get("/gemini/pinned", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const pinned = await db
    .select()
    .from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId))
    .orderBy(desc(conversations.updatedAt));

  const pinnedOnly = pinned.filter((c) => c.pinned);
  res.json(GetPinnedConversationsResponse.parse(pinnedOnly));
});

export default router;
