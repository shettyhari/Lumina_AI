import { Router, type IRouter } from "express";
import healthRouter from "./health";
import userRouter from "./user";
import geminiRouter from "./gemini";

const router: IRouter = Router();

router.use(healthRouter);
router.use(userRouter);
router.use(geminiRouter);

export default router;
