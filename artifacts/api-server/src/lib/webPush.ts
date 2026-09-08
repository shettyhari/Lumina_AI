/**
 * Web Push. VAPID keys are generated once and persisted in homeSettings
 * (same key-value table the weather city setting uses) rather than an env
 * var — this is a serverless deployment with no guaranteed way to set one
 * ourselves, and a regenerated key pair on every cold start would silently
 * invalidate every subscription a browser already holds.
 */

import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, homeSettings, pushSubscriptions } from "@workspace/db";
import { logger } from "./logger";

const VAPID_PUBLIC_KEY_SETTING = "vapid_public_key";
const VAPID_PRIVATE_KEY_SETTING = "vapid_private_key";

let vapidReady: Promise<string> | null = null;

async function ensureVapid(): Promise<string> {
  if (!vapidReady) {
    vapidReady = (async () => {
      const [pubRow] = await db.select().from(homeSettings).where(eq(homeSettings.key, VAPID_PUBLIC_KEY_SETTING)).limit(1);
      const [privRow] = await db.select().from(homeSettings).where(eq(homeSettings.key, VAPID_PRIVATE_KEY_SETTING)).limit(1);

      let publicKey = pubRow?.value;
      let privateKey = privRow?.value;

      if (!publicKey || !privateKey) {
        const generated = webpush.generateVAPIDKeys();
        publicKey = generated.publicKey;
        privateKey = generated.privateKey;
        await db.insert(homeSettings).values({ key: VAPID_PUBLIC_KEY_SETTING, value: publicKey })
          .onConflictDoUpdate({ target: homeSettings.key, set: { value: publicKey, updatedAt: new Date() } });
        await db.insert(homeSettings).values({ key: VAPID_PRIVATE_KEY_SETTING, value: privateKey })
          .onConflictDoUpdate({ target: homeSettings.key, set: { value: privateKey, updatedAt: new Date() } });
      }

      webpush.setVapidDetails("mailto:support@lina-ai.app", publicKey, privateKey);
      return publicKey;
    })();
  }
  return vapidReady;
}

export async function getVapidPublicKey(): Promise<string> {
  return ensureVapid();
}

export async function saveSubscription(clerkUserId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
  await ensureVapid();
  await db.insert(pushSubscriptions).values({ clerkUserId, endpoint, p256dh, auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { clerkUserId, p256dh, auth } });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function hasSubscriptions(clerkUserId: string): Promise<boolean> {
  const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.clerkUserId, clerkUserId)).limit(1);
  return rows.length > 0;
}

/** Sends to every device the user has subscribed on. Never throws — a push
 *  failure shouldn't take down whatever triggered it (an automation run, an
 *  arrival webhook); expired subscriptions (404/410) are cleaned up quietly. */
export async function sendPushToUser(clerkUserId: string, title: string, body: string, url = "/"): Promise<void> {
  try {
    await ensureVapid();
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.clerkUserId, clerkUserId));
    if (subs.length === 0) return;

    const payload = JSON.stringify({ title, body, url });
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        } else {
          logger.warn({ err }, "Push notification failed");
        }
      }
    }));
  } catch (err) {
    logger.warn({ err }, "sendPushToUser failed before any notification was sent");
  }
}
