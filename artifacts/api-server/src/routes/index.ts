import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import healthRouter from "./health";
import userRouter from "./user";
import userApiKeysRouter from "./userApiKeys";
import geminiRouter from "./gemini";
import modelsRouter from "./models";
import aiRouter from "./ai";
import adminRouter from "./admin";
import familyRouter from "./family";
import shoppingRouter from "./shopping";
import choresRouter from "./chores";
import calendarRouter from "./calendar";
import remindersRouter from "./reminders";
import mealsRouter from "./meals";
import { requireApproved } from "../middlewares/requireApproved";

const router: IRouter = Router();

// Paths that bypass approval gating (but still need auth if downstream requires it)
const OPEN_PATHS = new Set(["/healthz", "/user/status"]);

/**
 * Global auth + approval gate.
 * Extracts clerkUserId from the Clerk session and runs requireApproved
 * for all paths except the open whitelist.
 */
router.use(async (req: Request, res: Response, next: NextFunction) => {
  const userId = getAuth(req)?.userId;
  if (!userId) { next(); return; } // Unauthenticated — downstream routes return 401
  (req as any).clerkUserId = userId;

  if (OPEN_PATHS.has(req.path)) { next(); return; }

  await requireApproved(req, res, next);
});

router.use(healthRouter);
router.use(userRouter);
router.use(userApiKeysRouter);
router.use(geminiRouter);
router.use(modelsRouter);
router.use(aiRouter);
router.use(adminRouter);
router.use(familyRouter);
router.use(shoppingRouter);
router.use(choresRouter);
router.use(calendarRouter);
router.use(remindersRouter);
router.use(mealsRouter);

export default router;
