import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, familyEvents, familyMembers } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

async function enrichEvents(events: typeof familyEvents.$inferSelect[]) {
  const members = await db.select().from(familyMembers);
  const map = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));
  return events.map((e) => ({
    ...e,
    creatorName: map[e.clerkUserId]?.displayName ?? map[e.clerkUserId]?.email?.split("@")[0] ?? "Member",
    creatorAvatarUrl: map[e.clerkUserId]?.avatarUrl ?? null,
  }));
}

router.get("/calendar", requireAuth, async (req, res): Promise<void> => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = parseInt(req.query.month as string); // 1-12
  
  let events: typeof familyEvents.$inferSelect[];
  if (!isNaN(month) && month >= 1 && month <= 12) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    events = await db.select().from(familyEvents)
      .where(and(gte(familyEvents.startAt, start), lte(familyEvents.startAt, end)))
      .orderBy(familyEvents.startAt);
  } else {
    events = await db.select().from(familyEvents).orderBy(desc(familyEvents.startAt));
  }
  res.json(await enrichEvents(events));
});

router.post("/calendar", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { title, startAt, endAt, notes, color = "#6366f1" } = req.body ?? {};
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" }); return;
  }
  if (!startAt) { res.status(400).json({ error: "startAt is required" }); return; }
  const [event] = await db.insert(familyEvents).values({
    clerkUserId,
    title: title.trim(),
    startAt: new Date(startAt),
    endAt: endAt ? new Date(endAt) : null,
    notes: notes ? String(notes).trim() : null,
    color: String(color),
  }).returning();
  const [enriched] = await enrichEvents([event]);
  res.status(201).json(enriched);
});

router.delete("/calendar/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Only creator or admin can delete
  await db.delete(familyEvents).where(and(eq(familyEvents.id, id), eq(familyEvents.clerkUserId, clerkUserId)));
  res.status(204).end();
});

export default router;
