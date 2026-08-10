import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ai } from "@workspace/integrations-gemini-ai";
import { GoogleGenAI } from "@google/genai";
import { requireAuth } from "../middlewares/requireAuth";
import { getUserApiKeyRecord } from "../lib/userApiKeysStore";
import { MODELS } from "../lib/modelRegistry";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type CompatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
};

type CompatTool = {
  type: string;
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
};

// ─── OpenAI message shapes → Gemini contents ──────────────────────────────────

function extractText(content: CompatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (p.type === "text" ? p.text ?? "" : "")).join("");
  }
  return "";
}

function buildGeminiContents(messages: CompatMessage[]): { contents: any[]; systemPrompt: string } {
  const contents: any[] = [];
  const systemParts: string[] = [];
  const fnNameById = new Map<string, string>();

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(extractText(m.content));
      continue;
    }

    if (m.role === "user") {
      const parts: any[] = [];
      if (typeof m.content === "string") {
        parts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part.type === "image_url" && part.image_url?.url) {
            const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          } else if (part.type === "text" && part.text) {
            parts.push({ text: part.text });
          }
        }
      }
      if (parts.length > 0) contents.push({ role: "user", parts });
      continue;
    }

    if (m.role === "assistant") {
      const parts: any[] = [];
      const text = extractText(m.content);
      if (text) parts.push({ text });
      for (const tc of m.tool_calls ?? []) {
        fnNameById.set(tc.id, tc.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch { /* ignore malformed args */ }
        parts.push({ functionCall: { name: tc.function.name, args } });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    if (m.role === "tool") {
      const name = m.name ?? fnNameById.get(m.tool_call_id ?? "") ?? "unknown_tool";
      const output = extractText(m.content);
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name, response: { output } } }],
      });
      continue;
    }
  }

  // Coalesce consecutive same-role blocks (Gemini requires strict alternation)
  const merged: any[] = [];
  for (const c of contents) {
    const last = merged[merged.length - 1];
    if (last && last.role === c.role) {
      last.parts.push(...c.parts);
    } else {
      merged.push({ role: c.role, parts: [...c.parts] });
    }
  }

  return { contents: merged, systemPrompt: systemParts.join("\n\n") };
}

// ─── OpenAI tools → Gemini function declarations ──────────────────────────────

function toGeminiTools(tools?: CompatTool[]): any[] {
  return (tools ?? [])
    .filter((t) => t.type === "function" && t.function?.name)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description ?? "",
      parameters: t.function.parameters ?? { type: "object", properties: {} },
    }));
}

// ─── OpenAI SSE helpers ───────────────────────────────────────────────────────

function writeSse(res: Response, data: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function chunkPayload(id: string, model: string, delta: Record<string, unknown>, finish: string | null) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

// ─── GET /v1/models ───────────────────────────────────────────────────────────

router.get("/v1/models", requireAuth, async (_req: Request, res: Response): Promise<void> => {
  res.json({
    object: "list",
    data: MODELS.map((m) => ({
      id: m.id,
      object: "model",
      created: 0,
      owned_by: m.provider,
    })),
  });
});

// ─── POST /v1/chat/completions ────────────────────────────────────────────────

router.post("/v1/chat/completions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { model, messages, stream = true, tools, temperature } = req.body ?? {};

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Bad Request: 'messages' must be an array." });
    return;
  }

  const modelId: string = typeof model === "string" && model ? model : "gemini-flash-latest";
  const geminiModel = modelId.startsWith("gemini") ? modelId : "gemini-flash-latest";

  const { contents, systemPrompt } = buildGeminiContents(messages as CompatMessage[]);
  const geminiTools = toGeminiTools(tools as CompatTool[]);

  // Prefer the user's stored Gemini key, else fall back to the server key
  const userGeminiKey = await getUserApiKeyRecord(clerkUserId, "gemini");
  const geminiClient = userGeminiKey
    ? new GoogleGenAI({ apiKey: userGeminiKey })
    : ai;

  const config: Record<string, unknown> = { maxOutputTokens: 8192 };
  if (systemPrompt) config.systemInstruction = systemPrompt;
  if (typeof temperature === "number") config.temperature = temperature;
  if (geminiTools.length > 0) config.tools = [{ functionDeclarations: geminiTools }];

  const responseId = `chatcmpl-${randomUUID()}`;

  const finish = (reason: string | null, usage?: Record<string, unknown>) => {
    const payload = chunkPayload(responseId, modelId, {}, reason) as any;
    if (usage) payload.usage = usage;
    writeSse(res, payload);
  };

  // ── Non-streaming request: return a normal JSON completion ──
  if (stream === false) {
    try {
      const result = await geminiClient.models.generateContent({ model: geminiModel, contents, config });
      const parts: any[] = result.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
      const toolCalls = parts.filter((p: any) => p.functionCall).map((p: any) => ({
        id: `call_${randomUUID()}`,
        type: "function",
        function: {
          name: p.functionCall.name,
          arguments: JSON.stringify(p.functionCall.args ?? {}),
        },
      }));
      res.json({
        id: responseId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: text, tool_calls: toolCalls.length > 0 ? toolCalls : undefined },
            finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
          },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
      return;
    } catch (err) {
      logger.error({ err }, "OpenAI-compat non-streaming generation failed");
      res.status(500).json({ error: "AI generation failed" });
      return;
    }
  }

  // ── Streaming request: SSE in OpenAI format ──
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let textBuffer = "";
  let toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  const flushText = () => {
    if (!textBuffer) return;
    writeSse(res, chunkPayload(responseId, modelId, { content: textBuffer }, null));
    textBuffer = "";
  };

  try {
    const stream = await geminiClient.models.generateContentStream({ model: geminiModel, contents, config });
    for await (const chunk of stream) {
      const parts: any[] = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.functionCall) {
          flushText();
          toolCalls.push({
            name: part.functionCall.name,
            args: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        } else if (part.text) {
          textBuffer += part.text;
        }
      }
    }

    if (toolCalls.length > 0) {
      flushText();
      for (const [index, tc] of toolCalls.entries()) {
        writeSse(res, chunkPayload(responseId, modelId, {
          tool_calls: [{
            index,
            id: `call_${randomUUID()}`,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          }],
        }, null));
      }
      finish("tool_calls");
    } else {
      flushText();
      finish("stop");
    }
  } catch (err) {
    logger.error({ err }, "OpenAI-compat streaming generation failed");
    if (!res.writableEnded) {
      try {
        writeSse(res, { error: "AI generation failed" });
        writeSse(res, chunkPayload(responseId, modelId, {}, "stop"));
      } catch { /* ignore */ }
    }
  } finally {
    try {
      res.write("data: [DONE]\n\n");
      res.end();
    } catch { /* ignore */ }
  }
});

export default router;
