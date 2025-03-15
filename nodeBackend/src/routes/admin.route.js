import express from "express"
import { authMiddleware } from "../middleware/auth.js"
import { requestUserAccess,approveAccessFromUser,fetchAdminDetailsForUser,fetchUserAssignedToAdmin } from "../controllers/admin.controller.js";

const router = express.Router();
router.use(authMiddleware);

router.post("/requestAccess",requestUserAccess);
router.post("/approveAccess",approveAccessFromUser);
router.get("/getCareTaker",fetchAdminDetailsForUser);
router.get("/getAssignedUser",fetchUserAssignedToAdmin);

export default router;