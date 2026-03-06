import { Router } from "express";
import { register, login, logout, session, getProfile, editProfile } from "../controller/user.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/session", verifyToken, session);
router.get("/profile", verifyToken, getProfile);
router.put("/profile/edit", verifyToken, editProfile);

export default router;