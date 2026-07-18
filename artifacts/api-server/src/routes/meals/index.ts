import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, mealPlans, familyMembers } from "@workspace/db";
import { ai } from "@workspace/integrations-gemini-ai";
import { requireAuth } from "../../middlewares/requireAuth";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router: IRouter = Router();

const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function enrichMeals(plans: typeof mealPlans.$inferSelect[]) {
  const members = await db.select().from(familyMembers);
  const map = Object.fromEntries(members.map((m) => [m.clerkUserId, m]));
  return plans.map((p) => ({
    ...p,
    plannedByName: map[p.clerkUserId]?.displayName ?? map[p.clerkUserId]?.email?.split("@")[0] ?? "Member",
  }));
}

// GET /meals?weekStart=YYYY-MM-DD
router.get("/meals", requireAuth, async (req, res): Promise<void> => {
  const weekStart = req.query.weekStart as string | undefined;
  if (!weekStart) { res.status(400).json({ error: "weekStart is required (YYYY-MM-DD)" }); return; }
  const plans = await db.select().from(mealPlans).where(eq(mealPlans.weekStart, weekStart));
  res.json(await enrichMeals(plans));
});

// POST /meals — create or replace a meal slot
router.post("/meals", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { weekStart, dayOfWeek, mealSlot, dishName, notes } = req.body ?? {};
  if (!weekStart || dayOfWeek === undefined || !mealSlot || !dishName) {
    res.status(400).json({ error: "weekStart, dayOfWeek, mealSlot, dishName are required" }); return;
  }
  if (!MEAL_SLOTS.includes(mealSlot)) {
    res.status(400).json({ error: "mealSlot must be breakfast | lunch | dinner" }); return;
  }
  const dow = parseInt(dayOfWeek);
  if (isNaN(dow) || dow < 0 || dow > 6) { res.status(400).json({ error: "dayOfWeek must be 0–6" }); return; }

  // Upsert: delete existing and re-insert
  await db.delete(mealPlans).where(and(
    eq(mealPlans.weekStart, weekStart),
    eq(mealPlans.dayOfWeek, dow),
    eq(mealPlans.mealSlot, mealSlot),
  ));
  const [plan] = await db.insert(mealPlans).values({
    clerkUserId,
    weekStart,
    dayOfWeek: dow,
    mealSlot,
    dishName: String(dishName).trim(),
    notes: notes ? String(notes).trim() : null,
  }).returning();
  const [enriched] = await enrichMeals([plan]);
  res.status(201).json(enriched);
});

// DELETE /meals/:id
router.delete("/meals/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(mealPlans).where(eq(mealPlans.id, id));
  res.status(204).end();
});

// DELETE /meals/week?weekStart= — admin clears entire week
router.delete("/meals/week", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const weekStart = req.query.weekStart as string | undefined;
  if (!weekStart) { res.status(400).json({ error: "weekStart required" }); return; }
  await db.delete(mealPlans).where(eq(mealPlans.weekStart, weekStart));
  res.status(204).end();
});

// POST /meals/ai-suggest — AI suggests a meal for a slot
router.post("/meals/ai-suggest", requireAuth, async (req, res): Promise<void> => {
  const { dayOfWeek, mealSlot, existingMeals = [] } = req.body ?? {};
  const day = typeof dayOfWeek === "number" ? DAYS[dayOfWeek] : "today";
  const slot = String(mealSlot ?? "meal");
  const existing = Array.isArray(existingMeals) ? existingMeals.join(", ") : "";

  const prompt = `Suggest one specific ${slot} dish for ${day}. Keep it practical and delicious. Return ONLY the dish name (3-6 words max), nothing else.${existing ? ` Context: this week already has: ${existing}.` : ""}`;
  
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 50 },
    });
    const suggestion = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "Pasta Primavera";
    res.json({ suggestion: suggestion.replace(/[*_]/g, "").trim() });
  } catch {
    res.json({ suggestion: "Chef's Special" });
  }
});

export default router;
