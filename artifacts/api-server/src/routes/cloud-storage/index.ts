/**
 * Cloud Storage OAuth routes — per-user Google Drive (Dropbox / OneDrive to follow).
 *
 * Auth flow:
 *  1. GET /api/cloud-storage/google/auth     → redirect to Google OAuth consent
 *  2. GET /api/cloud-storage/google/callback → exchange code, store tokens, redirect to /cloud-storage
 *
 * File operations (all require Clerk auth):
 *  GET  /api/cloud-storage/google/status         → { connected, email, name, picture }
 *  GET  /api/cloud-storage/google/files           → list Drive files (?folderId=root)
 *  GET  /api/cloud-storage/google/download/:id   → proxy-stream the file
 *  DELETE /api/cloud-storage/google/disconnect   → remove stored tokens
 */

import { Router, type IRouter } from "express";
import { createHmac, randomBytes } from "node:crypto";
import { db, userCloudTokens } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { encryptApiKey, decryptApiKey } from "../../lib/crypto";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}/api/cloud-storage/google/callback`;
  throw new Error("Set GOOGLE_REDIRECT_URI or REPLIT_DEV_DOMAIN");
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set — cannot sign OAuth state tokens");
  return secret;
}

/** Signs a state token: base64url( clerkUserId.timestamp.hmac ) */
function signState(clerkUserId: string): string {
  const ts = Date.now().toString();
  const data = `${clerkUserId}.${ts}`;
  const sig = createHmac("sha256", getSessionSecret()).update(data).digest("hex").slice(0, 20);
  return Buffer.from(`${data}.${sig}`).toString("base64url");
}

/** Returns clerkUserId if state is valid and fresh (<10 min), otherwise null */
function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const secondLastDot = decoded.lastIndexOf(".", lastDot - 1);
    const clerkUserId = decoded.slice(0, secondLastDot);
    const ts = decoded.slice(secondLastDot + 1, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const data = `${clerkUserId}.${ts}`;
    const expected = createHmac("sha256", getSessionSecret()).update(data).digest("hex").slice(0, 20);
    if (sig !== expected) return null;
    if (Date.now() - parseInt(ts) > 10 * 60 * 1000) return null;
    return clerkUserId;
  } catch {
    return null;
  }
}

/** Returns a valid (auto-refreshed) access token for the user, or null. */
async function getValidAccessToken(clerkUserId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(userCloudTokens)
    .where(and(eq(userCloudTokens.clerkUserId, clerkUserId), eq(userCloudTokens.provider, "google")));

  if (!row) return null;
  const accessToken = decryptApiKey(row.encryptedAccessToken);

  // Still valid?
  if (!row.expiresAt || row.expiresAt.getTime() > Date.now() + 5 * 60_000) {
    return accessToken;
  }

  // Refresh
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

// ─── OAuth: initiate ──────────────────────────────────────────────────────────

router.get("/cloud-storage/google/auth", requireAuth, (req, res) => {
  const clerkUserId = (req as any).clerkUserId as string;
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Google Drive not configured — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" });
    return;
  }

  const state = signState(clerkUserId);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ─── OAuth: callback ──────────────────────────────────────────────────────────

router.get("/cloud-storage/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    res.redirect("/cloud-storage?error=access_denied");
    return;
  }

  const clerkUserId = verifyState(state);
  if (!clerkUserId) {
    res.redirect("/cloud-storage?error=invalid_state");
    return;
  }

  try {
    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: getRedirectUri(),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      req.log?.warn({ status: tokenResp.status }, "Google token exchange failed");
      res.redirect("/cloud-storage?error=token_exchange");
      return;
    }

    const tokens = await tokenResp.json() as { access_token: string; refresh_token?: string; expires_in?: number };

    // Get user profile
    const profileResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (profileResp.ok ? await profileResp.json() : {}) as { email?: string; name?: string; picture?: string };

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

    // Upsert token row
    const existing = await db
      .select()
      .from(userCloudTokens)
      .where(and(eq(userCloudTokens.clerkUserId, clerkUserId), eq(userCloudTokens.provider, "google")));

    if (existing.length > 0) {
      await db.update(userCloudTokens).set({
        encryptedAccessToken: encryptApiKey(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encryptApiKey(tokens.refresh_token) : existing[0].encryptedRefreshToken,
        expiresAt,
        accountEmail: profile.email,
        accountName: profile.name,
        accountPicture: profile.picture,
      }).where(and(eq(userCloudTokens.clerkUserId, clerkUserId), eq(userCloudTokens.provider, "google")));
    } else {
      await db.insert(userCloudTokens).values({
        clerkUserId,
        provider: "google",
        encryptedAccessToken: encryptApiKey(tokens.access_token),
        encryptedRefreshToken: tokens.refresh_token ? encryptApiKey(tokens.refresh_token) : null,
        expiresAt,
        accountEmail: profile.email,
        accountName: profile.name,
        accountPicture: profile.picture,
      });
    }

    res.redirect("/cloud-storage?connected=google");
  } catch (err) {
    req.log?.error({ err }, "Cloud storage callback error");
    res.redirect("/cloud-storage?error=server_error");
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────

router.get("/cloud-storage/google/status", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const [row] = await db
    .select()
    .from(userCloudTokens)
    .where(and(eq(userCloudTokens.clerkUserId, clerkUserId), eq(userCloudTokens.provider, "google")));

  if (!row) { res.json({ connected: false }); return; }
  res.json({
    connected: true,
    email: row.accountEmail,
    name: row.accountName,
    picture: row.accountPicture,
  });
});

// ─── List files ───────────────────────────────────────────────────────────────

router.get("/cloud-storage/google/files", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const folderId = (req.query.folderId as string) || "root";
  const pageToken = req.query.pageToken as string | undefined;

  const accessToken = await getValidAccessToken(clerkUserId);
  if (!accessToken) { res.status(401).json({ error: "Not connected" }); return; }

  const q = `'${folderId}' in parents and trashed = false`;
  const fields = "files(id,name,mimeType,size,modifiedTime,iconLink,thumbnailLink,parents,shortcutDetails),nextPageToken";
  const params = new URLSearchParams({ q, fields, pageSize: "100", orderBy: "folder,name" });
  if (pageToken) params.set("pageToken", pageToken);

  try {
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      const body = await resp.text();
      req.log?.warn({ status: resp.status, body }, "Drive list error");
      res.status(resp.status).json({ error: "Drive API error" }); return;
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    req.log?.error({ err }, "Drive list fetch failed");
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// ─── Download / stream ────────────────────────────────────────────────────────

router.get("/cloud-storage/google/download/:fileId", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { fileId } = req.params;

  const accessToken = await getValidAccessToken(clerkUserId);
  if (!accessToken) { res.status(401).json({ error: "Not connected" }); return; }

  try {
    // Get file metadata first
    const metaResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaResp.ok) { res.status(404).json({ error: "File not found" }); return; }
    const meta = await metaResp.json() as { name: string; mimeType: string; size?: string };

    // Google Docs / Sheets / Slides need export
    const exportMimeMap: Record<string, string> = {
      "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const exportMime = exportMimeMap[meta.mimeType];
    const downloadUrl = exportMime
      ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`
      : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const fileResp = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fileResp.ok) { res.status(500).json({ error: "Download failed" }); return; }

    const contentType = exportMime ?? meta.mimeType ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(meta.name)}"`);
    if (meta.size) res.setHeader("Content-Length", meta.size);

    // Stream body to client
    const reader = fileResp.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    };
    await pump();
  } catch (err) {
    req.log?.error({ err }, "Drive download error");
    res.status(500).json({ error: "Download failed" });
  }
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

router.delete("/cloud-storage/google/disconnect", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  await db.delete(userCloudTokens)
    .where(and(eq(userCloudTokens.clerkUserId, clerkUserId), eq(userCloudTokens.provider, "google")));
  res.json({ success: true });
});

export default router;
