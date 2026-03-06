import { Router } from "express";
import { getConstructors, getConstructorStandings } from "../controller/constructors.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/constructors", verifyToken, getConstructors);
router.get("/constructors/standings", verifyToken, getConstructorStandings);

export default router;