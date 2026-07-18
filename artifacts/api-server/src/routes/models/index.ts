import { Router, type IRouter } from "express";
import { ListModelsResponse } from "@workspace/api-zod";
import { MODELS } from "../../lib/modelRegistry";

const router: IRouter = Router();

router.get("/models", async (_req, res): Promise<void> => {
  res.json(ListModelsResponse.parse(MODELS));
});

export default router;
