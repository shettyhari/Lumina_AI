import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { requireAuth } from "../../middlewares/requireAuth";
import {
  getUserApiKeyRecord, saveUserApiKeyRecord, deleteUserApiKeyRecord, findClerkUserIdByProviderToken,
} from "../../lib/userApiKeysStore";
import { buildStatusBriefingText } from "../../lib/agentTools";
import { postAssistantMessage } from "../../lib/chatMessaging";

const PROVIDER = "arrival_webhook";

const router: IRouter = Router();

// ─── Per-user webhook token management (Settings → Smart Home) ──────────────

router.get("/user/arrival-webhook", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const existing = await getUserApiKeyRecord(clerkUserId, PROVIDER);
  res.json({ configured: existing != null });
});

// Generates (or regenerates) the token. Like most webhook secrets, it's only
// shown in full at creation time — losing it means generating a new one.
router.post("/user/arrival-webhook", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const token = randomBytes(24).toString("hex");
  await saveUserApiKeyRecord(clerkUserId, PROVIDER, token);
  res.json({ token });
});

router.delete("/user/arrival-webhook", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  await deleteUserApiKeyRecord(clerkUserId, PROVIDER);
  res.sendStatus(204);
});

// ─── Inbound trigger — called by the user's own Home Assistant automation ───

// No Clerk session here; the token itself is the credential (same shape as
// the CRON_SECRET check in routes/cron), so this path is deliberately not
// behind requireAuth. Configure a Home Assistant automation with a
// "Notify webhook" (REST command / webhook trigger) action pointing here
// when a person's device_tracker changes to "home".
router.post("/webhooks/arrival", async (req, res): Promise<void> => {
  const token = (req.query.token as string | undefined) ?? (req.body?.token as string | undefined);
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }

  const clerkUserId = await findClerkUserIdByProviderToken(PROVIDER, token);
  if (!clerkUserId) { res.status(401).json({ error: "Unknown or revoked token" }); return; }

  try {
    const briefing = await buildStatusBriefingText(clerkUserId);
    await postAssistantMessage(clerkUserId, `🏠 Welcome home! Here's where things stand:\n\n${briefing}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to build welcome briefing" });
  }
});

export default router;
