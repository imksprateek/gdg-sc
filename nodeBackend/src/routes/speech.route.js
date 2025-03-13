import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { optionalAuthMiddleware } from "../middleware/auth.js";
import { handleAudioChunk } from "../controllers/speech.controller.js";



const router = express.Router();


router.use(authMiddleware);

router.post('/speech', optionalAuthMiddleware, handleAudioChunk);

// For routes that require authentication
router.post('/secure-speech', authMiddleware, handleAudioChunk);

export default router;