import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/requireAuth";
import { getVapidPublicKey, saveSubscription, removeSubscription, hasSubscriptions } from "../../lib/webPush";

const router: IRouter = Router();

router.get("/push/vapid-public-key", requireAuth, async (_req, res): Promise<void> => {
  const publicKey = await getVapidPublicKey();
  res.json({ publicKey });
});

router.get("/push/status", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  res.json({ subscribed: await hasSubscriptions(clerkUserId) });
});

router.post("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "endpoint and keys.p256dh/keys.auth are required" });
    return;
  }
  await saveSubscription(clerkUserId, String(endpoint), String(keys.p256dh), String(keys.auth));
  res.status(201).json({ ok: true });
});

router.post("/push/unsubscribe", requireAuth, async (req, res): Promise<void> => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) { res.status(400).json({ error: "endpoint is required" }); return; }
  await removeSubscription(String(endpoint));
  res.status(204).end();
});

export default router;
