import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, automations } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";
import { computeNextRunAt, type AutomationSchedule } from "../../lib/automationSchedule";

const router: IRouter = Router();

const VALID_FREQ = ["once", "daily", "weekly"];

function isValidSchedule(schedule: unknown): schedule is AutomationSchedule {
  if (!schedule || typeof schedule !== "object") return false;
  const s = schedule as Record<string, unknown>;
  if (!VALID_FREQ.includes(s.freq as string)) return false;
  if (typeof s.time !== "string" || !/^\d{2}:\d{2}$/.test(s.time)) return false;
  if (typeof s.timezone !== "string" || s.timezone.length === 0) return false;
  if (s.freq === "weekly" && (typeof s.dayOfWeek !== "number" || s.dayOfWeek < 0 || s.dayOfWeek > 6)) return false;
  return true;
}

router.get("/automations", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const rows = await db.select().from(automations)
    .where(eq(automations.clerkUserId, clerkUserId))
    .orderBy(asc(automations.nextRunAt));
  res.json(rows);
});

router.post("/automations", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { description, toolName, toolArgs, schedule } = req.body ?? {};
  if (!description || typeof description !== "string") { res.status(400).json({ error: "description is required" }); return; }
  if (!toolName || typeof toolName !== "string") { res.status(400).json({ error: "toolName is required" }); return; }
  if (!isValidSchedule(schedule)) { res.status(400).json({ error: "schedule must be { freq, time: 'HH:mm', timezone, dayOfWeek? }" }); return; }

  const nextRunAt = computeNextRunAt(schedule);
  const [row] = await db.insert(automations).values({
    clerkUserId, description, toolName, toolArgs: toolArgs ?? {}, schedule, nextRunAt,
  }).returning();
  res.status(201).json(row);
});

router.patch("/automations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isActive } = req.body ?? {};
  if (typeof isActive !== "boolean") { res.status(400).json({ error: "isActive (boolean) is required" }); return; }
  const [row] = await db.update(automations).set({ isActive })
    .where(and(eq(automations.id, id), eq(automations.clerkUserId, clerkUserId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/automations/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(automations).where(and(eq(automations.id, id), eq(automations.clerkUserId, clerkUserId)));
  res.status(204).end();
});

export default router;
