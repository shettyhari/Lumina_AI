import { Router, type IRouter } from "express";
import healthRouter from "./health";
import userRouter from "./user";
import userApiKeysRouter from "./userApiKeys";
import geminiRouter from "./gemini";
import modelsRouter from "./models";

const router: IRouter = Router();

router.use(healthRouter);
router.use(userRouter);
router.use(userApiKeysRouter);
router.use(geminiRouter);
router.use(modelsRouter);

export default router;
