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
import notesRouter from "./notes";
import budgetRouter from "./budget";
import emergencyRouter from "./emergency";
import weatherRouter from "./weather";
import documentsRouter from "./documents";
import storageRouter from "./storage";
import maintenanceRouter from "./maintenance";
import billsRouter from "./bills";
import inventoryRouter from "./inventory";
import rewardsRouter from "./rewards";
import wishlistRouter from "./wishlist";
import petsRouter from "./pets";
import pantryRouter from "./pantry";
import briefingRouter from "./briefing";
import cloudStorageRouter from "./cloud-storage";
import { requireApproved } from "../middlewares/requireApproved";

const router: IRouter = Router();

const OPEN_PATHS = new Set(["/healthz", "/user/status"]);

router.use(async (req: Request, res: Response, next: NextFunction) => {
  const userId = getAuth(req)?.userId;
  if (!userId) { next(); return; }
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
router.use(notesRouter);
router.use(budgetRouter);
router.use(emergencyRouter);
router.use(weatherRouter);
router.use(documentsRouter);
router.use(storageRouter);
router.use(maintenanceRouter);
router.use(billsRouter);
router.use(inventoryRouter);
router.use(rewardsRouter);
router.use(wishlistRouter);
router.use(petsRouter);
router.use(pantryRouter);
router.use(briefingRouter);
router.use(cloudStorageRouter);

export default router;
