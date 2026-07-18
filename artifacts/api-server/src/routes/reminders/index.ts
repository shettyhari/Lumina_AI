import { Router, type IRouter } from "express";
import { eq, and, lte, asc } from "drizzle-orm";
import { db, reminders } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/reminders", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const items = await db.select().from(reminders)
    .where(eq(reminders.clerkUserId, clerkUserId))
    .orderBy(asc(reminders.remindAt));
  res.json(items);
});

// Poll endpoint: returns reminders that are now due (remindAt <= now, not yet triggered)
router.get("/reminders/due", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const now = new Date();
  const due = await db.select().from(reminders)
    .where(and(
      eq(reminders.clerkUserId, clerkUserId),
      eq(reminders.isTriggered, false),
      lte(reminders.remindAt, now),
    ));
  
  // Mark them triggered and, for repeating ones, schedule the next occurrence
  for (const r of due) {
    if (r.repeat === "daily") {
      const next = new Date(r.remindAt);
      next.setDate(next.getDate() + 1);
      await db.update(reminders).set({ remindAt: next }).where(eq(reminders.id, r.id));
    } else if (r.repeat === "weekly") {
      const next = new Date(r.remindAt);
      next.setDate(next.getDate() + 7);
      await db.update(reminders).set({ remindAt: next }).where(eq(reminders.id, r.id));
    } else {
      await db.update(reminders).set({ isTriggered: true }).where(eq(reminders.id, r.id));
    }
  }
  
  res.json(due);
});

router.post("/reminders", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { message, remindAt, repeat = "none" } = req.body ?? {};
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" }); return;
  }
  if (!remindAt) { res.status(400).json({ error: "remindAt is required" }); return; }
  const validRepeats = ["none", "daily", "weekly"];
  const [reminder] = await db.insert(reminders).values({
    clerkUserId,
    message: message.trim(),
    remindAt: new Date(remindAt),
    repeat: validRepeats.includes(repeat) ? repeat : "none",
  }).returning();
  res.status(201).json(reminder);
});

router.delete("/reminders/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.clerkUserId, clerkUserId)));
  res.status(204).end();
});

export default router;
