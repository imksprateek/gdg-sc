import express from "express";
import { clearContext, forwardImageToFlask, forwardQueryToFlask } from "../controllers/context.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import multer from "multer";

export const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();


router.use(authMiddleware);

router.post("/describe-image", upload.single("image"), forwardImageToFlask);
router.get("/query", forwardQueryToFlask);
router.post("/clear-context", clearContext);

export default router;

