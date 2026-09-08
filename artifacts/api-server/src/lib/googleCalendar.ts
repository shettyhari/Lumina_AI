import { db, familyEvents } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getValidGoogleAccessToken } from "./googleAuth";

export class GoogleCalendarError extends Error {}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
}

/**
 * One-way import: Google Calendar -> Lina's shared family calendar. Events
 * created in Lina are NOT pushed back to Google — that's a real follow-up,
 * not something to fake here. Idempotent via externalId: re-running this
 * updates events that changed and skips ones that didn't, rather than
 * creating duplicates on every sync.
 */
export async function syncGoogleCalendarEvents(clerkUserId: string): Promise<{ imported: number; updated: number; skipped: number }> {
  const accessToken = await getValidGoogleAccessToken(clerkUserId);
  if (!accessToken) {
    throw new GoogleCalendarError("Google isn't connected yet — connect it from Cloud Storage in Settings, then try again.");
  }

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin, timeMax,
    singleEvents: "true", // expands recurring events into concrete instances — Google does the RRULE math
    orderBy: "startTime",
    maxResults: "250",
  });

  const resp = await fetch(`https://www.googleapis.com/calendar/v3/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new GoogleCalendarError("Google Calendar access was denied — reconnect Google from Cloud Storage in Settings (the calendar permission may not have been granted yet).");
  }
  if (!resp.ok) {
    throw new GoogleCalendarError(`Google Calendar API returned ${resp.status}.`);
  }

  const data = await resp.json() as { items?: GoogleCalendarEvent[] };
  const events = (data.items ?? []).filter((e) => e.status !== "cancelled" && e.id && e.start);

  let imported = 0, updated = 0, skipped = 0;
  for (const gEvent of events) {
    const startRaw = gEvent.start?.dateTime ?? gEvent.start?.date;
    if (!startRaw) { skipped++; continue; }
    const startAt = new Date(startRaw);
    if (isNaN(startAt.getTime())) { skipped++; continue; }
    const endRaw = gEvent.end?.dateTime ?? gEvent.end?.date;
    const endAt = endRaw ? new Date(endRaw) : undefined;
    const title = gEvent.summary?.trim() || "(untitled)";

    const [existing] = await db.select().from(familyEvents).where(eq(familyEvents.externalId, gEvent.id));
    if (existing) {
      const changed = existing.title !== title || existing.startAt.getTime() !== startAt.getTime() ||
        (existing.endAt?.getTime() ?? null) !== (endAt?.getTime() ?? null);
      if (changed) {
        await db.update(familyEvents).set({ title, startAt, endAt, notes: gEvent.description ?? null }).where(eq(familyEvents.id, existing.id));
        updated++;
      } else {
        skipped++;
      }
    } else {
      await db.insert(familyEvents).values({ clerkUserId, title, startAt, endAt, notes: gEvent.description ?? null, externalId: gEvent.id });
      imported++;
    }
  }

  return { imported, updated, skipped };
}
