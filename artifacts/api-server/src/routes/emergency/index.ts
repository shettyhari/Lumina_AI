import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, emergencyContacts, familyMembers } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router: IRouter = Router();

// All approved members can view
router.get("/emergency/contacts", requireAuth, async (_req, res): Promise<void> => {
  const contacts = await db.select().from(emergencyContacts).orderBy(asc(emergencyContacts.priority));
  res.json(contacts);
});

// Admin only: create, update, delete
router.post("/emergency/contacts", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { name, relationship, phone, notes, priority = 10 } = req.body ?? {};
  if (!name || !relationship || !phone) {
    res.status(400).json({ error: "name, relationship, and phone are required" }); return;
  }
  const [contact] = await db.insert(emergencyContacts).values({
    name: String(name).trim(), relationship: String(relationship).trim(),
    phone: String(phone).trim(), notes: notes ? String(notes).trim() : null,
    priority: parseInt(priority) || 10,
  }).returning();
  res.status(201).json(contact);
});

router.patch("/emergency/contacts/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.relationship !== undefined) updates.relationship = String(req.body.relationship).trim();
  if (req.body.phone !== undefined) updates.phone = String(req.body.phone).trim();
  if (req.body.notes !== undefined) updates.notes = req.body.notes;
  if (req.body.priority !== undefined) updates.priority = parseInt(req.body.priority);
  const [updated] = await db.update(emergencyContacts).set(updates).where(eq(emergencyContacts.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/emergency/contacts/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(emergencyContacts).where(eq(emergencyContacts.id, id));
  res.status(204).end();
});

export default router;
