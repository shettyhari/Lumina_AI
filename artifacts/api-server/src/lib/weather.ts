/**
 * Real weather data via Open-Meteo (free, no API key). Replaces the old
 * approach of asking the LLM to "guess" a forecast from general knowledge —
 * every number here comes from an actual forecast API, and the summary text
 * is templated from those numbers rather than generated, so nothing is
 * hallucinated.
 */

export interface WeatherCard {
  day: string;
  emoji: string;
  high: string;
  low: string;
  summary: string;
}

export interface WeatherBriefing {
  city: string;
  text: string;
  cards: WeatherCard[];
  needsSetup: boolean;
}

// WMO weather codes (used by Open-Meteo) -> emoji + short label
const WMO: Record<number, { emoji: string; summary: string }> = {
  0: { emoji: "☀️", summary: "Clear sky" },
  1: { emoji: "🌤️", summary: "Mostly clear" },
  2: { emoji: "⛅", summary: "Partly cloudy" },
  3: { emoji: "☁️", summary: "Overcast" },
  45: { emoji: "🌫️", summary: "Fog" },
  48: { emoji: "🌫️", summary: "Depositing rime fog" },
  51: { emoji: "🌦️", summary: "Light drizzle" },
  53: { emoji: "🌦️", summary: "Drizzle" },
  55: { emoji: "🌧️", summary: "Dense drizzle" },
  61: { emoji: "🌧️", summary: "Light rain" },
  63: { emoji: "🌧️", summary: "Rain" },
  65: { emoji: "🌧️", summary: "Heavy rain" },
  71: { emoji: "🌨️", summary: "Light snow" },
  73: { emoji: "🌨️", summary: "Snow" },
  75: { emoji: "❄️", summary: "Heavy snow" },
  80: { emoji: "🌦️", summary: "Rain showers" },
  81: { emoji: "🌧️", summary: "Rain showers" },
  82: { emoji: "⛈️", summary: "Violent rain showers" },
  85: { emoji: "🌨️", summary: "Snow showers" },
  86: { emoji: "❄️", summary: "Heavy snow showers" },
  95: { emoji: "⛈️", summary: "Thunderstorm" },
  96: { emoji: "⛈️", summary: "Thunderstorm with hail" },
  99: { emoji: "⛈️", summary: "Severe thunderstorm" },
};

function describeCode(code: number): { emoji: string; summary: string } {
  return WMO[code] ?? { emoji: "🌡️", summary: "Mixed conditions" };
}

interface GeocodeResponse {
  results?: Array<{ latitude: number; longitude: number; name: string }>;
}

interface ForecastResponse {
  current: { temperature_2m: number; weather_code: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
}

async function geocodeCity(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  if (!res.ok) return null;
  const data = (await res.json()) as GeocodeResponse;
  const r = data.results?.[0];
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, name: r.name };
}

export async function fetchWeatherBriefing(city: string): Promise<Omit<WeatherBriefing, "needsSetup">> {
  const place = await geocodeCity(city);
  if (!place) throw new Error(`Could not find a location matching "${city}".`);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
    `&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=fahrenheit&timezone=auto&forecast_days=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather service unavailable right now.");
  const data = (await res.json()) as ForecastResponse;

  const currentTemp = Math.round(data.current.temperature_2m);
  const currentDesc = describeCode(data.current.weather_code);

  const days: string[] = data.daily.time;
  const codes: number[] = data.daily.weather_code;
  const highs: number[] = data.daily.temperature_2m_max;
  const lows: number[] = data.daily.temperature_2m_min;

  const cards: WeatherCard[] = days.map((iso, i) => {
    const desc = describeCode(codes[i]);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(iso).toLocaleDateString("en-US", { weekday: "long" });
    return { day: label, emoji: desc.emoji, high: `${Math.round(highs[i])}°F`, low: `${Math.round(lows[i])}°F`, summary: desc.summary };
  });

  const today = cards[0];
  const text = `${place.name} is ${currentDesc.summary.toLowerCase()} at ${currentTemp}°F right now. ` +
    `Expect a high of ${today.high} and a low of ${today.low} today.`;

  return { city: place.name, text, cards };
}
