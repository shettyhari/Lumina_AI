import { Router, type IRouter, type Request, type Response } from "express";
import { db, familyEvents, chores, bills, homeSettings } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

let briefingCache: { text: string; generatedAt: number } | null = null;
const CACHE_MS = 3 * 60 * 60 * 1000;

router.get("/briefing/morning", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (briefingCache && Date.now() - briefingCache.generatedAt < CACHE_MS) {
    res.json({ text: briefingCache.text, cached: true });
    return;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [todayEvents, pendingChores, allBills, cityRow] = await Promise.all([
    db.select().from(familyEvents).where(and(gte(familyEvents.startAt, todayStart), lte(familyEvents.startAt, todayEnd))),
    db.select().from(chores).where(eq(chores.status, "todo")).limit(5),
    db.select().from(bills).where(eq(bills.isActive, true)),
    db.select().from(homeSettings).where(eq(homeSettings.key, "city")).limit(1),
  ]);

  const city = (cityRow[0] as any)?.value ?? "your city";
  const dueSoon = allBills.filter(b => {
    const due = b.dueDayOfMonth;
    const today = now.getDate();
    return due >= today && due <= today + 7;
  });

  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const prompt = `You are Lumina, a warm family home assistant. Write a cheerful morning briefing for the family.

Today is ${today}. Location: ${city}.

Family update:
- Events today: ${todayEvents.length > 0 ? todayEvents.map(e => e.title).join(", ") : "Nothing scheduled"}
- Pending chores: ${pendingChores.length > 0 ? pendingChores.map(c => c.title).join(", ") : "All caught up!"}
- Bills due this week: ${dueSoon.length > 0 ? dueSoon.map(b => `${b.name} ($${(b.amountCents / 100).toFixed(2)})`).join(", ") : "None"}

Write 3-4 warm, friendly sentences covering the day ahead. Start with a cheerful greeting like "Good morning, [family name]!" Use "the family" if you don't know their name.`;

  try {
    const result = await ai.models.generateContent({ model: "gemini-2.0-flash", contents: prompt });
    const text = result.text ?? "Good morning! Wishing your family a wonderful day ahead. ☀️";
    briefingCache = { text, generatedAt: Date.now() };
    res.json({ text, cached: false, generatedAt: new Date(briefingCache.generatedAt).toISOString() });
  } catch (err) {
    console.error("Briefing generation failed:", err);
    // Return a friendly fallback instead of a 500
    const fallback = "Good morning, family! Wishing you a wonderful day ahead. Check your calendar, stay on top of chores, and make the most of today! ☀️";
    res.json({ text: fallback, cached: false, generatedAt: new Date().toISOString() });
  }
});

// Bust cache (admin use)
router.delete("/briefing/cache", requireAuth, async (req: Request, res: Response): Promise<void> => {
  briefingCache = null;
  res.json({ cleared: true });
});

export default router;
