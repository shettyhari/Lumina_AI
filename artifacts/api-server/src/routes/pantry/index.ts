import { Router, type IRouter, type Request, type Response } from "express";
import { db, pantryItems } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { ai } from "@workspace/integrations-gemini-ai";
import { parseGroceryPhoto, GroceryPhotoParseError } from "../../lib/groceryPhotoParsing";

const router: IRouter = Router();

router.get("/pantry", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const items = await db.select().from(pantryItems).where(eq(pantryItems.clerkUserId, clerkUserId)).orderBy(asc(pantryItems.name));
  res.json(items);
});

router.post("/pantry", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { name, quantity, category, expiresAt } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [item] = await db.insert(pantryItems).values({
    clerkUserId, name, quantity, category,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  res.status(201).json(item);
});

router.patch("/pantry/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { name, quantity, category, expiresAt } = req.body;
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (quantity !== undefined) update.quantity = quantity;
  if (category !== undefined) update.category = category;
  if (expiresAt !== undefined) update.expiresAt = expiresAt ? new Date(expiresAt) : null;
  const [item] = await db.update(pantryItems).set(update).where(eq(pantryItems.id, Number(req.params.id))).returning();
  res.json(item);
});

router.delete("/pantry/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  await db.delete(pantryItems).where(eq(pantryItems.id, Number(req.params.id)));
  res.status(204).end();
});

// Scan a photo of groceries (already uploaded via /documents) and add
// everything identifiable straight to the pantry — same underlying
// extraction as the add_pantry_items_from_photo agent tool, exposed here
// as a direct button on the Pantry page since referencing a document by id
// from chat isn't a great flow for something this routine.
router.post("/pantry/scan", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const documentFileId = Number(req.body?.documentFileId);
  if (isNaN(documentFileId)) { res.status(400).json({ error: "documentFileId required" }); return; }
  try {
    const extraction = await parseGroceryPhoto(clerkUserId, documentFileId);
    const inserted = [];
    for (const item of extraction.items) {
      const [row] = await db.insert(pantryItems).values({ clerkUserId, name: item.name, quantity: item.quantity ?? undefined, category: item.category }).returning();
      inserted.push(row);
    }
    res.json({ items: inserted });
  } catch (err) {
    if (err instanceof GroceryPhotoParseError) { res.status(400).json({ error: err.message }); return; }
    res.status(500).json({ error: "Failed to read that grocery photo." });
  }
});

// AI meal suggestions based on pantry contents
router.post("/pantry/ai-suggest", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const items = await db.select().from(pantryItems).where(eq(pantryItems.clerkUserId, clerkUserId));
  if (items.length === 0) { res.status(400).json({ error: "Add some pantry items first" }); return; }
  const pantryList = items.map(i => `${i.name}${i.quantity ? ` (${i.quantity})` : ""}`).join(", ");
  const result = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: `You are a creative home chef. Based on these pantry items: ${pantryList}

Suggest 3 meals the family can make right now. Respond ONLY with valid JSON:
{
  "suggestions": [
    { "name": "Pasta Primavera", "description": "Light Italian pasta", "uses": ["pasta", "tomatoes"], "cookTime": "20 min", "emoji": "🍝" }
  ]
}`,
  });
  const text = result.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { res.status(500).json({ error: "Failed to generate suggestions" }); return; }
  try { res.json(JSON.parse(jsonMatch[0])); } catch { res.status(500).json({ error: "Invalid AI response" }); }
});

export default router;
