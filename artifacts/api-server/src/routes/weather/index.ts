import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, homeSettings } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

// In-memory weather cache: city → { text, cards, cachedAt }
const weatherCache = new Map<string, { text: string; cards: WeatherCard[]; cachedAt: Date }>();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

interface WeatherCard {
  day: string;
  emoji: string;
  high: string;
  low: string;
  summary: string;
}

async function getCity(): Promise<string> {
  const row = await db.select().from(homeSettings).where(eq(homeSettings.key, "city")).limit(1);
  return row[0]?.value ?? "";
}

router.get("/weather/briefing", requireAuth, async (_req, res): Promise<void> => {
  const city = await getCity();
  if (!city) {
    res.json({ city: "", text: "", cards: [], needsSetup: true }); return;
  }

  const cached = weatherCache.get(city);
  if (cached && (Date.now() - cached.cachedAt.getTime()) < CACHE_TTL_MS) {
    res.json({ city, text: cached.text, cards: cached.cards, needsSetup: false }); return;
  }

  try {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const prompt = `You are a friendly family home assistant. Today is ${today}.

Give a weather briefing for ${city}. Use your general knowledge about seasonal weather patterns for this location.

Respond ONLY with valid JSON in this exact format:
{
  "text": "One friendly paragraph (2-3 sentences) summarizing current conditions and what to expect today.",
  "cards": [
    { "day": "Today", "emoji": "☀️", "high": "75°F", "low": "58°F", "summary": "Sunny" },
    { "day": "Tomorrow", "emoji": "⛅", "high": "70°F", "low": "55°F", "summary": "Partly cloudy" },
    { "day": "Wednesday", "emoji": "🌧️", "high": "62°F", "low": "50°F", "summary": "Rainy" },
    { "day": "Thursday", "emoji": "🌤️", "high": "68°F", "low": "52°F", "summary": "Mostly sunny" },
    { "day": "Friday", "emoji": "☀️", "high": "72°F", "low": "56°F", "summary": "Clear" }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const raw = response.text?.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim() ?? "{}";
    const parsed = JSON.parse(raw) as { text: string; cards: WeatherCard[] };

    weatherCache.set(city, { text: parsed.text, cards: parsed.cards, cachedAt: new Date() });
    res.json({ city, text: parsed.text, cards: parsed.cards, needsSetup: false });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch weather briefing" });
  }
});

router.get("/weather/city", requireAuth, async (_req, res): Promise<void> => {
  const city = await getCity();
  res.json({ city });
});

router.patch("/settings/home", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { city } = req.body ?? {};
  if (city !== undefined) {
    await db.insert(homeSettings).values({ key: "city", value: String(city).trim() })
      .onConflictDoUpdate({ target: homeSettings.key, set: { value: String(city).trim(), updatedAt: new Date() } });
    // bust cache for old city
    weatherCache.clear();
  }
  const all = await db.select().from(homeSettings);
  res.json(Object.fromEntries(all.map((r) => [r.key, r.value])));
});

export default router;
