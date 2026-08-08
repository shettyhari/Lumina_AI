import { Router, type IRouter } from "express";
import { and, eq, lte, desc, sql } from "drizzle-orm";
import { db, automations, conversations, messages } from "@workspace/db";
import { executeTool } from "../../lib/agentTools";
import { computeNextRunAt } from "../../lib/automationSchedule";

const router: IRouter = Router();

function isAuthorized(req: import("express").Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // refuse to run with no secret configured
  const header = req.headers.authorization;
  return header === `Bearer ${secret}`;
}

async function postSystemMessage(clerkUserId: string, content: string): Promise<void> {
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

// Triggered by Vercel Cron (see vercel.json). Not user-facing — protected by
// a shared secret, not Clerk auth, since Vercel Cron calls it with no session.
router.post("/cron/run-due", async (req, res): Promise<void> => {
  if (!isAuthorized(req)) { res.status(401).json({ error: "Unauthorized" }); return; }

  const now = new Date();
  const due = await db.select().from(automations)
    .where(and(eq(automations.isActive, true), lte(automations.nextRunAt, now)));

  let ran = 0;
  let failed = 0;
  for (const automation of due) {
    const result = await executeTool(automation.clerkUserId, automation.toolName, automation.toolArgs);
    if (result.success) ran++; else failed++;

    await postSystemMessage(
      automation.clerkUserId,
      result.success
        ? `⏰ Automation ran: "${automation.description}"\n\n${result.summary}`
        : `⚠️ Automation "${automation.description}" didn't run: ${result.summary}`,
    );

    if (automation.schedule.freq === "once") {
      await db.update(automations).set({ isActive: false, lastRunAt: now }).where(eq(automations.id, automation.id));
    } else {
      const nextRunAt = computeNextRunAt(automation.schedule, now);
      await db.update(automations).set({ lastRunAt: now, nextRunAt }).where(eq(automations.id, automation.id));
    }
  }

  res.json({ checked: due.length, ran, failed });
});

export default router;
