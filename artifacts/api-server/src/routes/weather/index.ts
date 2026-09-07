import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, homeSettings } from "@workspace/db";
import { requireAuth } from "../../middlewares/requireAuth";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { fetchWeatherBriefing, type WeatherCard } from "../../lib/weather.js";

const router: IRouter = Router();

// In-memory weather cache: city → { text, cards, cachedAt }
const weatherCache = new Map<string, { city: string; text: string; cards: WeatherCard[]; cachedAt: Date }>();
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

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
    res.json({ city: cached.city, text: cached.text, cards: cached.cards, needsSetup: false }); return;
  }

  try {
    const briefing = await fetchWeatherBriefing(city);
    weatherCache.set(city, { ...briefing, cachedAt: new Date() });
    res.json({ ...briefing, needsSetup: false });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch weather briefing" });
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
