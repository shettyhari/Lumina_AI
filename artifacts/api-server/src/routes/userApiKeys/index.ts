import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, userApiKeys } from "@workspace/db";
import {
  ListUserApiKeysResponse,
  SetUserApiKeyBody,
  SetUserApiKeyResponse,
  DeleteUserApiKeyParams,
} from "@workspace/api-zod";
import { encryptApiKey, decryptApiKey } from "../../lib/crypto";
import { requireAuth } from "../../middlewares/requireAuth";

const VALID_PROVIDERS = ["openai", "anthropic", "openrouter"] as const;

const router: IRouter = Router();

function maskKey(plaintext: string): string {
  if (plaintext.length <= 8) return "••••••••";
  return plaintext.slice(0, 4) + "••••••••" + plaintext.slice(-4);
}

router.get("/user/api-keys", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const keys = await db
    .select()
    .from(userApiKeys)
    .where(eq(userApiKeys.clerkUserId, clerkUserId));

  const result = keys.map((k) => {
    let decrypted = "";
    try { decrypted = decryptApiKey(k.encryptedKey); } catch { decrypted = ""; }
    return { provider: k.provider, maskedKey: maskKey(decrypted), createdAt: k.createdAt };
  });

  res.json(ListUserApiKeysResponse.parse(result));
});

// POST /user/api-keys  { provider, key }
router.post("/user/api-keys", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const parsed = SetUserApiKeyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { provider, key } = parsed.data;
  if (!VALID_PROVIDERS.includes(provider as any)) {
    res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` });
    return;
  }

  const encrypted = encryptApiKey(key);
  const maskedKey = maskKey(key);
  const now = new Date();

  const existing = await db
    .select()
    .from(userApiKeys)
    .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));

  if (existing.length > 0) {
    await db.update(userApiKeys).set({ encryptedKey: encrypted, updatedAt: now })
      .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, provider)));
  } else {
    await db.insert(userApiKeys).values({ clerkUserId, provider, encryptedKey: encrypted });
  }

  res.json(SetUserApiKeyResponse.parse({ provider, maskedKey, createdAt: now }));
});

router.delete("/user/api-keys/:provider", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = DeleteUserApiKeyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(userApiKeys)
    .where(and(eq(userApiKeys.clerkUserId, clerkUserId), eq(userApiKeys.provider, params.data.provider)));
  res.sendStatus(204);
});

export default router;
