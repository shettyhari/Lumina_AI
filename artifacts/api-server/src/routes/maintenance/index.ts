import { Router, type IRouter, type Request, type Response } from "express";
import { db, maintenanceTasks } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/maintenance", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const tasks = await db.select().from(maintenanceTasks).orderBy(asc(maintenanceTasks.nextDueAt));
  res.json(tasks);
});

router.post("/maintenance", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { title, description, category, intervalDays } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const nextDueAt = intervalDays ? new Date(Date.now() + Number(intervalDays) * 86400000) : null;
  const [task] = await db.insert(maintenanceTasks).values({ title, description, category, intervalDays: intervalDays ? Number(intervalDays) : null, nextDueAt }).returning();
  res.status(201).json(task);
});

router.patch("/maintenance/:id/done", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = Number(req.params.id);
  const [task] = await db.select().from(maintenanceTasks).where(eq(maintenanceTasks.id, id)).limit(1);
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  const now = new Date();
  const nextDueAt = task.intervalDays ? new Date(now.getTime() + task.intervalDays * 86400000) : null;
  const [updated] = await db.update(maintenanceTasks)
    .set({ lastDoneAt: now, lastDoneBy: clerkUserId, nextDueAt })
    .where(eq(maintenanceTasks.id, id))
    .returning();
  res.json(updated);
});

router.delete("/maintenance/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await db.delete(maintenanceTasks).where(eq(maintenanceTasks.id, Number(req.params.id)));
  res.status(204).end();
});

export default router;
