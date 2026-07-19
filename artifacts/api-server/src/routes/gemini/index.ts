import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, conversations, messages, users, userApiKeys, aiMemories } from "@workspace/db";
import { detectAndExecuteRelay } from "../../lib/relayDetector";
import { isBudgetQuestion, getBudgetContext, detectBudgetMonth, detectBudgetComparison, detectBudgetLogHint } from "../../lib/intentDetector";
import { TOOL_DECLARATIONS, executeTool } from "../../lib/agentTools";
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

type ChatMessage = { role: "user" | "assistant"; content: string; imageData?: string | null };

function buildGeminiContents(chatMessages: ChatMessage[]): any[] {
  return chatMessages.map((m) => {
    const parts: any[] = [];
    if (m.imageData) {
      const match = m.imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
    parts.push({ text: m.content });
    return {
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts,
    };
  });
}

/**
 * Agentic Gemini loop: calls tools when needed, then streams the final text response.
 * Sends SSE events: toolCall, toolResult, content, done.
 */
async function streamGeminiAgentic(
  model: string,
  chatMessages: ChatMessage[],
  systemPrompt: string | undefined,
  clerkUserId: string,
  sendEvent: (obj: object) => void,
  reasoningMode = false,
  originalMessage = "",
  webSearch = false,
): Promise<string> {
  const contents: any[] = buildGeminiContents(chatMessages);

  const agentSystemPrompt = (systemPrompt || "") +
    `\n\nYou are Lina, an agentic AI home assistant for a family. You have access to tools that let you take real actions:
- Manage the shopping list (add items, check them off, view the list)
- Set and view reminders
- Manage chores (add, complete, list)
- Add and view calendar events
- Record budget entries and view spending summaries
- Create and search notes
- Manage the pantry inventory
- View family members and send direct messages to them

When the user asks you to do something you can accomplish with a tool, USE THE TOOL immediately — don't just describe what you would do. After taking action, confirm what you did concisely.

You can chain multiple tools in one response when it makes sense (e.g. check the pantry, then add missing items to the shopping list).

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

  const toolsList: any[] = [{ functionDeclarations: TOOL_DECLARATIONS }];
  if (webSearch) toolsList.push({ googleSearch: {} });

  const config: Record<string, unknown> = {
    maxOutputTokens: 8192,
    tools: toolsList,
  };
  if (agentSystemPrompt) config.systemInstruction = agentSystemPrompt;
  if (reasoningMode) (config as any).thinkingConfig = { thinkingBudget: 2048 };

  let fullText = "";
  const MAX_ITERATIONS = 6;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Non-streaming call to detect function calls
    const response = await ai.models.generateContent({ model, contents, config });
    const parts: any[] = response.candidates?.[0]?.content?.parts ?? [];

    const funcCalls = parts.filter((p: any) => p.functionCall);
    const textParts = parts.filter((p: any) => p.text);

    if (funcCalls.length === 0) {
      // Final text response — stream it in chunks for smooth UX
      const text = textParts.map((p: any) => p.text as string).join("");
      fullText += text;
      const chunkSize = 40;
      for (let j = 0; j < text.length; j += chunkSize) {
        sendEvent({ content: text.slice(j, j + chunkSize) });
      }
      return fullText;
    }

    // Execute all function calls in this iteration
    const funcResponseParts: any[] = [];
    for (const part of funcCalls) {
      const { name, args } = part.functionCall;
      sendEvent({ toolCall: { name, args: args ?? {} } });
      const result = await executeTool(clerkUserId, name, args ?? {}, { originalMessage });
      sendEvent({ toolResult: { name, success: result.success, summary: result.summary } });
      funcResponseParts.push({
        functionResponse: {
          name,
          response: { output: result.summary, success: result.success },
        },
      });
    }

    // Append model turn + function responses to continue the conversation
    contents.push({ role: "model", parts });
    contents.push({ role: "user", parts: funcResponseParts });
  }

  // Safety fallback
  const fallback = "I've completed the requested actions.";
  sendEvent({ content: fallback });
  return fallback;
}

async function streamGemini(
  model: string,
  chatMessages: ChatMessage[],
  systemPrompt: string | undefined,
  onChunk: (text: string) => void,
  reasoningMode = false,
): Promise<string> {
  const contents = buildGeminiContents(chatMessages);
  const config: Record<string, unknown> = { maxOutputTokens: 8192 };
  if (systemPrompt) config.systemInstruction = systemPrompt;
  if (reasoningMode) (config as any).thinkingConfig = { thinkingBudget: 2048 };

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
  for (const m of chatMessages) {
    if (m.imageData) {
      const match = m.imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        oaiMessages.push({
          role: "user" as const,
          content: [
            { type: "image_url", image_url: { url: m.imageData } },
            { type: "text", text: m.content },
          ],
        });
        continue;
      }
    }
    oaiMessages.push({ role: m.role, content: m.content });
  }

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
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": "https://lina-ai.replit.app" },
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

  const [userRow] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
  const model = parsed.data.model ?? userRow?.preferredModel ?? "gemini-2.5-flash";
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

  // Build effective system prompt: user setting + active persona + injected memories
  let systemPrompt = parsed.data.systemPrompt ?? userRow?.systemPrompt ?? "";

  // Inject AI memories into system prompt
  const userMemories = await db
    .select()
    .from(aiMemories)
    .where(eq(aiMemories.clerkUserId, clerkUserId));
  if (userMemories.length > 0) {
    const memoryBlock = `\n\n[User Memory]\n${userMemories.map((m, i) => `${i + 1}. ${m.content}`).join("\n")}`;
    systemPrompt = (systemPrompt || "") + memoryBlock;
  }

  // Inject budget context if the user is asking a budget question
  const comparisonTarget = detectBudgetComparison(parsed.data.content);
  if (comparisonTarget) {
    // Comparison query: fetch both periods in parallel and inject both summaries
    try {
      const [ctx1, ctx2] = await Promise.all([
        getBudgetContext(clerkUserId, comparisonTarget.period1),
        getBudgetContext(clerkUserId, comparisonTarget.period2),
      ]);
      systemPrompt = (systemPrompt || "") +
        `\n\n${ctx1}\n\n${ctx2}\n\nThe user wants a side-by-side comparison of these two periods. Clearly show the delta (difference) for totals and key categories. State which period had higher income/expenses and by how much. Be specific with numbers from the data above.`;
    } catch (err) {
      req.log.warn({ err }, "Failed to fetch budget comparison context");
    }
  } else if (isBudgetQuestion(parsed.data.content)) {
    try {
      const budgetMonthTarget = detectBudgetMonth(parsed.data.content);
      const budgetContext = await getBudgetContext(clerkUserId, budgetMonthTarget);
      systemPrompt = (systemPrompt || "") + `\n\n${budgetContext}\n\nUse the budget data above to answer the user's question accurately. Refer to specific numbers from the data.`;
    } catch (err) {
      req.log.warn({ err }, "Failed to fetch budget context");
    }
  }

  // Inject budget log hint if the user is logging an expense or income
  const budgetLogHint = detectBudgetLogHint(parsed.data.content);
  if (budgetLogHint) {
    systemPrompt = (systemPrompt || "") + `\n\n${budgetLogHint}`;
  }

  // Save user message (with optional image data for vision)
  const imageData = parsed.data.imageBase64
    ? `data:${parsed.data.imageMimeType ?? "image/jpeg"};base64,${parsed.data.imageBase64}`
    : null;

  await db.insert(messages).values({
    conversationId: conv.id,
    role: "user",
    content: parsed.data.content,
    imageData,
  });

  // Load history
  const history = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(messages.createdAt);
  const chatMessages: ChatMessage[] = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
    imageData: m.imageData,
  }));

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendChunk = (text: string) => res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
  const reasoningMode = parsed.data.reasoningMode ?? false;

  try {
    let fullResponse = "";

    if (provider === "gemini") {
      // Agentic loop: native function calling with tool use
      const webSearch = (req.body as any)?.webSearch === true;
      fullResponse = await streamGeminiAgentic(
        model, chatMessages, systemPrompt || undefined, clerkUserId,
        (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`),
        reasoningMode,
        parsed.data.content,
        webSearch,
      );
    } else if (provider === "openai") {
      const key = await getUserApiKey(clerkUserId, "openai");
      fullResponse = await streamOpenAI(key!, model, chatMessages, systemPrompt || undefined, sendChunk);
    } else if (provider === "anthropic") {
      const key = await getUserApiKey(clerkUserId, "anthropic");
      fullResponse = await streamAnthropic(key!, model, chatMessages, systemPrompt || undefined, sendChunk);
    } else if (provider === "openrouter") {
      const key = await getUserApiKey(clerkUserId, "openrouter");
      fullResponse = await streamOpenRouter(key!, model, chatMessages, systemPrompt || undefined, sendChunk);
    }

    // ── AI relay detection (still useful for non-Gemini providers) ────────
    const relay = await detectAndExecuteRelay(clerkUserId, parsed.data.content);
    let savedResponse = fullResponse;
    if (relay) {
      const confirmLine = `\n\n*${relay.confirmMsg}*`;
      savedResponse += confirmLine;
      sendChunk(confirmLine);
    }

    await db.insert(messages).values({ conversationId: conv.id, role: "assistant", content: savedResponse });
    await db.update(conversations)
      .set({ messageCount: sql`${conversations.messageCount} + 2`, updatedAt: new Date() })
      .where(eq(conversations.id, conv.id));

    if (relay) {
      res.write(`data: ${JSON.stringify({ relayConfirm: relay.confirmMsg })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    req.log.error({ err }, "LLM streaming error");
    res.write(`data: ${JSON.stringify({ error: "AI generation failed" })}\n\n`);
  } finally {
    res.end();
  }
});

// ─── Export Conversation ──────────────────────────────────────────────────────

router.get("/gemini/conversations/:id/export", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv || conv.clerkUserId !== clerkUserId) { res.status(404).json({ error: "Not found" }); return; }

  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);

  const lines: string[] = [
    `# ${conv.title}`,
    `*Exported from Lina AI on ${new Date().toLocaleDateString()}*`,
    "",
  ];

  for (const msg of msgs) {
    const role = msg.role === "user" ? "**You**" : "**Lina**";
    lines.push(`### ${role}`);
    if (msg.imageData) lines.push(`*[Image attached]*\n`);
    lines.push(msg.content);
    lines.push("");
  }

  res.json({
    title: conv.title,
    markdown: lines.join("\n"),
    exportedAt: new Date().toISOString(),
  });
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
    res.status(500).json({ error: "Image generation failed. The model may not support image output on this integration." });
  }
});

// ─── Daily Digest ─────────────────────────────────────────────────────────────

router.get("/gemini/digest", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;

  // Get recent conversations (last 7 days)
  const recent = await db.select().from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId))
    .orderBy(desc(conversations.updatedAt))
    .limit(10);

  if (recent.length === 0) {
    res.json({
      summary: "No recent conversations to summarize. Start chatting with Lina to get your daily digest!",
      generatedAt: new Date().toISOString(),
      conversationCount: 0,
    });
    return;
  }

  // Gather last message from each conversation
  const snippets: string[] = [];
  for (const conv of recent.slice(0, 5)) {
    const [lastMsg] = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (lastMsg) {
      snippets.push(`- "${conv.title}": ${lastMsg.content.slice(0, 120)}...`);
    }
  }

  const prompt = `You are a personal AI assistant. The user has had ${recent.length} recent conversations. Here's a brief overview:\n\n${snippets.join("\n")}\n\nWrite a warm, concise daily digest (2-3 sentences) summarizing the user's recent AI activity and suggesting what they might want to explore next. Be encouraging and personalized.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const summary = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "Here's a summary of your recent activity.";
    res.json({
      summary,
      generatedAt: new Date().toISOString(),
      conversationCount: recent.length,
    });
  } catch (err) {
    res.json({
      summary: `You've had ${recent.length} recent conversations with Lina. Keep exploring!`,
      generatedAt: new Date().toISOString(),
      conversationCount: recent.length,
    });
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
    .where(and(eq(conversations.clerkUserId, clerkUserId), eq(conversations.pinned, true)))
    .orderBy(desc(conversations.updatedAt));
  res.json(GetPinnedConversationsResponse.parse(pinned));
});

export default router;
