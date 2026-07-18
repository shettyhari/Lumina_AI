import { Router, type IRouter, type Request, type Response } from "express";
import { db, pets, petCareLogs } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pets", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const all = await db.select().from(pets).orderBy(asc(pets.name));
  res.json(all);
});

router.post("/pets", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name, species, breed, birthday, avatarEmoji, notes } = req.body;
  if (!name || !species) { res.status(400).json({ error: "name and species required" }); return; }
  const [pet] = await db.insert(pets).values({ name, species, breed, birthday: birthday ? new Date(birthday) : null, avatarEmoji, notes }).returning();
  res.status(201).json(pet);
});

router.patch("/pets/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name, species, breed, birthday, avatarEmoji, notes } = req.body;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (species !== undefined) update.species = species;
  if (breed !== undefined) update.breed = breed;
  if (birthday !== undefined) update.birthday = birthday ? new Date(birthday) : null;
  if (avatarEmoji !== undefined) update.avatarEmoji = avatarEmoji;
  if (notes !== undefined) update.notes = notes;
  const [pet] = await db.update(pets).set(update).where(eq(pets.id, Number(req.params.id))).returning();
  res.json(pet);
});

router.delete("/pets/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await db.delete(pets).where(eq(pets.id, Number(req.params.id)));
  res.status(204).end();
});

// Care logs
router.get("/pets/:id/logs", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const logs = await db.select().from(petCareLogs)
    .where(eq(petCareLogs.petId, Number(req.params.id)))
    .orderBy(desc(petCareLogs.completedAt))
    .limit(50);
  res.json(logs);
});

router.post("/pets/:id/logs", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { type, notes } = req.body;
  if (!type) { res.status(400).json({ error: "type required" }); return; }
  const [log] = await db.insert(petCareLogs).values({ petId: Number(req.params.id), clerkUserId, type, notes }).returning();
  res.status(201).json(log);
});

export default router;
