import { Router, type IRouter } from "express";
import { requireAuth } from "../../middlewares/requireAuth";
import { buildStatusBriefingText } from "../../lib/agentTools";

const router: IRouter = Router();

// Direct HTTP path to the same briefing get_status_briefing builds — lets
// the dashboard HUD widget render it without going through the chat/LLM
// pipeline at all (faster, and nothing here is LLM-generated).
router.get("/status/briefing", requireAuth, async (req, res): Promise<void> => {
  const clerkUserId = (req as any).clerkUserId as string;
  const text = await buildStatusBriefingText(clerkUserId);
  res.json({ text, generatedAt: new Date().toISOString() });
});

export default router;
