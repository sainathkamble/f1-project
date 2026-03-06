import { Router } from "express";
import { getDrivers, getDriverDetails, getErgastDriverId, getDriverStandings } from "../controller/drivers.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/drivers", verifyToken, getDrivers);
router.get("/driver/:driverId", verifyToken, getDriverDetails);
router.get("/driver-map/:season", verifyToken, getErgastDriverId); 
router.get("/drivers/standings", verifyToken, getDriverStandings);

export default router;
