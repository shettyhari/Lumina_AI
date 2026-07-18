import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, conversations, messages, users, userApiKeys } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { generateImage } from "@workspace/integrations-gemini-ai/image";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
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
import { and } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { decryptApiKey } from "../../lib/crypto";
import { getProviderForModel } from "../../lib/modelRegistry";

const router: IRouter = Router();

// ─── Helper: get decrypted API key for a provider ────────────────────────────

async function getUserApiKey(clerkUserId: string, provider: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userApiKeys)
    .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));
  if (!row) return null;
  try {
    return decryptApiKey(row.encryptedKey);
  } catch {
    return null;
  }
}

// ─── SSE stream helpers per provider ─────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string };

async function streamGemini(
  model: string,
  chatMessages: ChatMessage[],
  systemPrompt: string | undefined,
  onChunk: (text: string) => void,
): Promise<string> {
  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));
  const config: Record<string, unknown> = { maxOutputTokens: 8192 };
  if (systemPrompt) config.systemInstruction = systemPrompt;

  let full = "";
  const stream = await ai.models.generateContentStream({ model, contents, config });
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) { full += text; onChunk(text); }
  }
  return full;
}

async function streamOpenAI(
  apiKey: string,
  model: string,
  chatMessages: ChatMessage[],
  systemPrompt: string | undefined,
  onChunk: (text: string) => void,
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) oaiMessages.push({ role: "system", content: systemPrompt });
  for (const m of chatMessages) oaiMessages.push({ role: m.role, content: m.content });

  let full = "";
  const stream = await client.chat.completions.create({ model, messages: oaiMessages, stream: true });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) { full += text; onChunk(text); }
  }
  return full;
}

async function streamAnthropic(
  apiKey: string,
  model: string,
  chatMessages: ChatMessage[],
  systemPrompt: string | undefined,
  onChunk: (text: string) => void,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const anthropicMessages: Anthropic.MessageParam[] = chatMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let full = "";
  const stream = await client.messages.create({
    model,
    max_tokens: 8096,
    system: systemPrompt,
    messages: anthropicMessages,
    stream: true,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      const text = event.delta.text;
      if (text) { full += text; onChunk(text); }
    }
  }
  return full;
}

async function streamOpenRouter(
  apiKey: string,
  model: string,
  chatMessages: ChatMessage[],
  systemPrompt: string | undefined,
  onChunk: (text: string) => void,
): Promise<string> {
  // OpenRouter is OpenAI-compatible
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": "https://lumina-ai.replit.app" },
  });

  const orModelId = model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;
  const oaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) oaiMessages.push({ role: "system", content: systemPrompt });
  for (const m of chatMessages) oaiMessages.push({ role: m.role, content: m.content });

  let full = "";
  const stream = await client.chat.completions.create({
    model: orModelId,
    messages: oaiMessages,
    stream: true,
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) { full += text; onChunk(text); }
  }
  return full;
}

// ─── Conversations ────────────────────────────────────────────────────────────

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
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [conv] = await db.insert(conversations).values({ clerkUserId, title: parsed.data.title }).returning();
  res.status(201).json(CreateGeminiConversationResponse.parse(conv));
});

router.get("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = GetGeminiConversationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv || conv.clerkUserId !== clerkUserId) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt);
  res.json(GetGeminiConversationResponse.parse({ ...conv, messages: msgs }));
});

router.patch("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = UpdateGeminiConversationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateGeminiConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!existing || existing.clerkUserId !== clerkUserId) { res.status(404).json({ error: "Not found" }); return; }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.pinned !== undefined) updateData.pinned = parsed.data.pinned;
  const [updated] = await db.update(conversations).set(updateData).where(eq(conversations.id, params.data.id)).returning();
  res.json(UpdateGeminiConversationResponse.parse(updated));
});

router.delete("/gemini/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = DeleteGeminiConversationParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [existing] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!existing || existing.clerkUserId !== clerkUserId) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(conversations).where(eq(conversations.id, params.data.id));
  res.sendStatus(204);
});

// ─── Messages (SSE multi-provider streaming) ──────────────────────────────────

router.get("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = ListGeminiMessagesParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv || conv.clerkUserId !== clerkUserId) { res.status(404).json({ error: "Not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt);
  res.json(ListGeminiMessagesResponse.parse(msgs));
});

router.post("/gemini/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = SendGeminiMessageParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SendGeminiMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, params.data.id));
  if (!conv || conv.clerkUserId !== clerkUserId) { res.status(404).json({ error: "Not found" }); return; }

  const [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  const model = parsed.data.model ?? user?.preferredModel ?? "gemini-2.5-flash";
  const systemPrompt = parsed.data.systemPrompt ?? user?.systemPrompt ?? undefined;
  const provider = getProviderForModel(model);

  // Check API key for paid providers
  if (provider !== "gemini") {
    const key = await getUserApiKey(clerkUserId, provider);
    if (!key) {
      res.status(402).json({
        error: `API key required for ${provider}. Add it in Settings → AI Providers.`,
        provider,
      });
      return;
    }
  }

  // Save user message
  await db.insert(messages).values({ conversationId: conv.id, role: "user", content: parsed.data.content });

  // Load history
  const history = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt);
  const chatMessages: ChatMessage[] = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendChunk = (text: string) => res.write(`data: ${JSON.stringify({ content: text })}\n\n`);

  try {
    let fullResponse = "";

    if (provider === "gemini") {
      fullResponse = await streamGemini(model, chatMessages, systemPrompt, sendChunk);
    } else if (provider === "openai") {
      const key = await getUserApiKey(clerkUserId, "openai");
      fullResponse = await streamOpenAI(key!, model, chatMessages, systemPrompt, sendChunk);
    } else if (provider === "anthropic") {
      const key = await getUserApiKey(clerkUserId, "anthropic");
      fullResponse = await streamAnthropic(key!, model, chatMessages, systemPrompt, sendChunk);
    } else if (provider === "openrouter") {
      const key = await getUserApiKey(clerkUserId, "openrouter");
      fullResponse = await streamOpenRouter(key!, model, chatMessages, systemPrompt, sendChunk);
    }

    await db.insert(messages).values({ conversationId: conv.id, role: "assistant", content: fullResponse });
    await db.update(conversations)
      .set({ messageCount: sql`${conversations.messageCount} + 2`, updatedAt: new Date() })
      .where(eq(conversations.id, conv.id));

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "LLM streaming error");
    res.write(`data: ${JSON.stringify({ error: "AI generation failed" })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Image Generation ─────────────────────────────────────────────────────────

router.post("/gemini/generate-image", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const parsed = GenerateGeminiImageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const { b64_json, mimeType } = await generateImage(parsed.data.prompt);
    await db.update(users).set({ imagesGenerated: sql`${users.imagesGenerated} + 1` }).where(eq(users.clerkUserId, clerkUserId));
    res.json(GenerateGeminiImageResponse.parse({ b64_json, mimeType }));
  } catch (err) {
    req.log.error({ err }, "Image generation failed");
    res.status(500).json({ error: "Image generation failed" });
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/gemini/recent-activity", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const convs = await db.select().from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId))
    .orderBy(desc(conversations.updatedAt))
    .limit(20);

  const activity = await Promise.all(convs.map(async (conv) => {
    const [lastMsg] = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return { id: conv.id, title: conv.title, pinned: conv.pinned, lastMessage: lastMsg?.content?.slice(0, 100) ?? null, messageCount: conv.messageCount, updatedAt: conv.updatedAt };
  }));

  res.json(GetRecentActivityResponse.parse(activity));
});

router.get("/gemini/pinned", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const pinned = await db.select().from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId))
    .orderBy(desc(conversations.updatedAt));
  res.json(GetPinnedConversationsResponse.parse(pinned.filter((c) => c.pinned)));
});

export default router;
