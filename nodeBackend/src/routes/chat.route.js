import express from "express"
import { authMiddleware } from "../middleware/auth.js"
import { startConversation,storeMessageAndAiResponse,fetchAllChatSessions,fetchChatForParticularSession } from "../controllers/chat.controller.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/new",startConversation);
router.post("/sendMessage",storeMessageAndAiResponse);
router.get("/sessions",fetchAllChatSessions);
router.get("/history/:chatId",fetchChatForParticularSession);

export default router;
