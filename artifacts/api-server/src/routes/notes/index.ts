import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, familyNotes, familyMembers } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

async function enrichNotes(notes: typeof familyNotes.$inferSelect[]) {
  const members = await db.select().from(familyMembers);
  const map = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));
  return notes.map((n) => ({
    ...n,
    authorName: map[n.clerkUserId]?.displayName ?? map[n.clerkUserId]?.email?.split("@")[0] ?? "Member",
    authorAvatarUrl: map[n.clerkUserId]?.avatarUrl ?? null,
  }));
}

router.get("/notes", requireAuth, async (_req, res): Promise<void> => {
  const notes = await db.select().from(familyNotes)
    .orderBy(desc(familyNotes.isPinned), desc(familyNotes.updatedAt));
  res.json(await enrichNotes(notes));
});

router.post("/notes", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { title, body = "", color = "#fef08a" } = req.body ?? {};
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    res.status(400).json({ error: "title is required" }); return;
  }
  const [note] = await db.insert(familyNotes).values({
    clerkUserId, title: title.trim(), body: String(body), color: String(color),
  }).returning();
  const [enriched] = await enrichNotes([note]);
  res.status(201).json(enriched);
});

router.patch("/notes/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.title !== undefined) updates.title = String(req.body.title).trim();
  if (req.body.body !== undefined) updates.body = String(req.body.body);
  if (req.body.color !== undefined) updates.color = String(req.body.color);
  if (req.body.isPinned !== undefined) updates.isPinned = Boolean(req.body.isPinned);
  const [updated] = await db.update(familyNotes).set(updates)
    .where(and(eq(familyNotes.id, id), eq(familyNotes.clerkUserId, clerkUserId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found or not your note" }); return; }
  const [enriched] = await enrichNotes([updated]);
  res.json(enriched);
});

router.delete("/notes/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(familyNotes).where(and(eq(familyNotes.id, id), eq(familyNotes.clerkUserId, clerkUserId)));
  res.status(204).end();
});

export default router;
