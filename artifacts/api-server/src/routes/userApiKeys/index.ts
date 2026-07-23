import { Router, type IRouter } from "express";
import {
  ListUserApiKeysResponse,
  SetUserApiKeyBody,
  SetUserApiKeyResponse,
  DeleteUserApiKeyParams,
} from "@workspace/api-zod";
import { requireAuth } from "../../middlewares/requireAuth";
import {
  listUserApiKeysRecords,
  saveUserApiKeyRecord,
  deleteUserApiKeyRecord,
} from "../../lib/userApiKeysStore";

const VALID_PROVIDERS = ["gemini", "openai", "anthropic", "openrouter"] as const;

const router: IRouter = Router();

router.get("/user/api-keys", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const result = await listUserApiKeysRecords(clerkUserId);
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

  const result = await saveUserApiKeyRecord(clerkUserId, provider, key);
  res.json(SetUserApiKeyResponse.parse(result));
});

router.delete("/user/api-keys/:provider", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const params = DeleteUserApiKeyParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await deleteUserApiKeyRecord(clerkUserId, params.data.provider);
  res.sendStatus(204);
});

export default router;
