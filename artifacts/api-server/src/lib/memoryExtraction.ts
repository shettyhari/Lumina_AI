/**
 * Automatic long-term memory extraction. The memory system already existed
 * (aiMemories, injected into every conversation's system prompt) but was
 * manual-entry only — the user had to open Settings and type a fact in
 * themselves for Lina to "remember" anything. This closes that loop: after
 * a message that sounds like it's stating something durable (a preference,
 * a relationship, a recurring constraint), a small model call checks
 * against what's already known and saves anything genuinely new.
 *
 * Gated by a cheap heuristic prefilter so this doesn't add a second LLM
 * call to every ordinary "add milk to the list" turn — only messages that
 * look like they might carry durable personal info trigger it.
 */

import { eq } from "drizzle-orm";
import { db, aiMemories } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";

const MEMORY_SIGNAL = /\b(i(?:'m| am)? (?:really |always |never )?(?:like|love|prefer|hate|dislike|allerg\w*|vegetarian|vegan)|my (?:wife|husband|son|daughter|kid|partner|mom|dad|mother|father|dog|cat|pet|birthday|anniversary)\b|remember (?:that|this)\b|please remember|don'?t forget|we (?:always|never)|favou?rite)\b/i;

export function looksMemoryWorthy(message: string): boolean {
  return MEMORY_SIGNAL.test(message);
}

/** Extracts and saves any new durable facts from this exchange. Returns the
 *  saved fact strings (empty if nothing new/durable was found) so the
 *  caller can surface a "Remembered: ..." toast. Never throws — a failure
 *  here shouldn't affect the actual chat reply. */
export async function extractAndSaveMemories(clerkUserId: string, userMessage: string, assistantReply: string): Promise<string[]> {
  try {
    const existing = await db.select().from(aiMemories).where(eq(aiMemories.clerkUserId, clerkUserId));
    const existingText = existing.length > 0 ? existing.map((m) => `- ${m.content}`).join("\n") : "(none yet)";

    const prompt = `Existing long-term memories about this user:\n${existingText}\n\n` +
      `Latest exchange:\nUser: ${userMessage}\nAssistant: ${assistantReply}\n\n` +
      `If the user's message states a durable fact worth remembering across future conversations — a preference, a relationship, an allergy or constraint, a recurring habit — AND it is not already covered by the existing memories above, respond with a JSON array of 1-2 short, third-person memory sentences (e.g. "Prefers metric units", "Daughter Emma is allergic to peanuts"). ` +
      `If the message is just a one-off request/action (adding an item, asking a question, small talk) with nothing durable in it, or the fact is already known, respond with exactly [].`;

    const result = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 200 },
    });
    const raw = result.text?.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim() ?? "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const facts = parsed.filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, 2);
    const saved: string[] = [];
    for (const fact of facts) {
      const trimmed = fact.trim();
      await db.insert(aiMemories).values({ clerkUserId, content: trimmed });
      saved.push(trimmed);
    }
    return saved;
  } catch {
    return [];
  }
}
