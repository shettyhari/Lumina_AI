import { eq, desc, sql } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";

/**
 * Posts an assistant message into a user's most recent conversation (or
 * starts a new one), for background/system-triggered content — automations,
 * the arrival webhook — that isn't a reply to something the user just typed.
 */
export async function postAssistantMessage(clerkUserId: string, content: string): Promise<void> {
  const [latest] = await db.select().from(conversations)
    .where(eq(conversations.clerkUserId, clerkUserId))
    .orderBy(desc(conversations.updatedAt)).limit(1);

  const conversationId = latest
    ? latest.id
    : (await db.insert(conversations).values({ clerkUserId, title: "Lina" }).returning())[0].id;

  await db.insert(messages).values({ conversationId, role: "assistant", content });
  await db.update(conversations)
    .set({ messageCount: sql`message_count + 1`, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}
