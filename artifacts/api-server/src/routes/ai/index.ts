import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, aiMemories, aiPersonas } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

// ─── AI Memories ──────────────────────────────────────────────────────────────

router.get("/ai/memories", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const memories = await db
    .select()
    .from(aiMemories)
    .where(eq(aiMemories.clerkUserId, clerkUserId))
    .orderBy(aiMemories.createdAt);
  res.json(memories.map(m => ({ id: m.id, content: m.content, createdAt: m.createdAt })));
});

router.post("/ai/memories", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { content } = req.body ?? {};
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  if (content.length > 2000) { res.status(400).json({ error: "content too long (max 2000)" }); return; }
  const [mem] = await db.insert(aiMemories).values({ clerkUserId, content: content.trim() }).returning();
  res.status(201).json({ id: mem.id, content: mem.content, createdAt: mem.createdAt });
});

router.delete("/ai/memories/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(aiMemories).where(and(eq(aiMemories.id, id), eq(aiMemories.clerkUserId, clerkUserId)));
  res.status(204).end();
});

// ─── AI Personas ──────────────────────────────────────────────────────────────

router.get("/ai/personas", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const personas = await db
    .select()
    .from(aiPersonas)
    .where(eq(aiPersonas.clerkUserId, clerkUserId))
    .orderBy(aiPersonas.createdAt);
  res.json(personas);
});

router.post("/ai/personas", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { name, emoji = "🤖", systemPrompt, isDefault = false } = req.body ?? {};
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" }); return;
  }
  if (!systemPrompt || typeof systemPrompt !== "string" || systemPrompt.trim().length === 0) {
    res.status(400).json({ error: "systemPrompt is required" }); return;
  }

  if (isDefault) {
    await db.update(aiPersonas).set({ isDefault: false }).where(eq(aiPersonas.clerkUserId, clerkUserId));
  }

  const [persona] = await db.insert(aiPersonas).values({
    clerkUserId,
    name: name.trim(),
    emoji: typeof emoji === "string" ? emoji : "🤖",
    systemPrompt: systemPrompt.trim(),
    isDefault: Boolean(isDefault),
  }).returning();
  res.status(201).json(persona);
});

router.patch("/ai/personas/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(aiPersonas).where(and(eq(aiPersonas.id, id), eq(aiPersonas.clerkUserId, clerkUserId)));
  if (!existing) { res.status(404).json({ error: "Persona not found" }); return; }

  const { name, emoji, systemPrompt, isDefault } = req.body ?? {};

  if (isDefault === true) {
    await db.update(aiPersonas).set({ isDefault: false }).where(eq(aiPersonas.clerkUserId, clerkUserId));
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = String(name).trim();
  if (emoji !== undefined) updateData.emoji = String(emoji);
  if (systemPrompt !== undefined) updateData.systemPrompt = String(systemPrompt).trim();
  if (isDefault !== undefined) updateData.isDefault = Boolean(isDefault);

  const [updated] = await db.update(aiPersonas).set(updateData).where(eq(aiPersonas.id, id)).returning();
  res.json(updated);
});

router.delete("/ai/personas/:id", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(aiPersonas).where(and(eq(aiPersonas.id, id), eq(aiPersonas.clerkUserId, clerkUserId)));
  res.status(204).end();
});

export default router;
