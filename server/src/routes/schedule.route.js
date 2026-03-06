import { Router } from "express";
import { getSchedule } from "../controller/schedule.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/schedule", verifyToken, getSchedule);

export default router;