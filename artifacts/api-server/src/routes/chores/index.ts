import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, chores, familyMembers } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

async function enrichChores(items: typeof chores.$inferSelect[]) {
  const members = await db.select().from(familyMembers);
  const map = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));
  return items.map((c) => ({
    ...c,
    assignedToName: c.assignedToClerkUserId
      ? (map[c.assignedToClerkUserId]?.displayName ?? map[c.assignedToClerkUserId]?.email?.split("@")[0] ?? "Member")
      : null,
    assignedToAvatarUrl: c.assignedToClerkUserId ? (map[c.assignedToClerkUserId]?.avatarUrl ?? null) : null,
    createdByName: map[c.createdByClerkUserId]?.displayName ?? "Member",
  }));
}

router.get("/chores", requireAuth, async (_req, res): Promise<void> => {
  const items = await db.select().from(chores).orderBy(desc(chores.createdAt));
  res.json(await enrichChores(items));
});

router.post("/chores", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { title, description, assignedToClerkUserId, dueDate, priority = "medium" } = req.body ?? {};
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" }); return;
  }
  const [chore] = await db.insert(chores).values({
    createdByClerkUserId: clerkUserId,
    title: title.trim(),
    description: description ? String(description).trim() : null,
    assignedToClerkUserId: assignedToClerkUserId ?? null,
    dueDate: dueDate ?? null,
    priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
    status: "todo",
  }).returning();
  const [enriched] = await enrichChores([chore]);
  res.status(201).json(enriched);
});

router.patch("/chores/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.priority !== undefined) updates.priority = req.body.priority;
  if (req.body.title !== undefined) updates.title = String(req.body.title).trim();
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate;
  if (req.body.assignedToClerkUserId !== undefined) updates.assignedToClerkUserId = req.body.assignedToClerkUserId;
  const [updated] = await db.update(chores).set(updates).where(eq(chores.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  const [enriched] = await enrichChores([updated]);
  res.json(enriched);
});

router.delete("/chores/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(chores).where(eq(chores.id, id));
  res.status(204).end();
});

export default router;
