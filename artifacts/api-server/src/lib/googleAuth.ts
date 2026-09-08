import { db, userCloudTokens } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { encryptApiKey, decryptApiKey } from "./crypto";

/** Returns a valid (auto-refreshed) Google access token for the user, or
 *  null if they haven't connected Google or the connection needs to be
 *  redone (e.g. after a new scope was added — refresh tokens don't grant
 *  scopes that weren't consented to at the time). Shared by cloud-storage
 *  (Drive) and calendar sync — one Google connection, multiple scopes. */
export async function getValidGoogleAccessToken(clerkUserId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userCloudTokens)
    .where(and(eq(userCloudTokens.clerkUserId, clerkUserId), eq(userCloudTokens.provider, "google")));

  if (!row) return null;
  const accessToken = decryptApiKey(row.encryptedAccessToken);

  if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 5 * 60_000) {
    return accessToken;
  }

  if (!row.encryptedRefreshToken) return null;
  const refreshToken = decryptApiKey(row.encryptedRefreshToken);
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as { access_token: string; expires_in?: number };
  const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  await db.update(userCloudTokens).set({
    encryptedAccessToken: encryptApiKey(data.access_token),
    expiresAt: newExpiresAt,
  }).where(and(eq(userCloudTokens.clerkUserId, clerkUserId), eq(userCloudTokens.provider, "google")));
  return data.access_token;
}
