import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

export const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ valid: false, message: "No token, not authenticated" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ valid: false, message: "User not found" });
    }

    req.user = user; // attach user to request
    next();
  } catch (err) {
    res.clearCookie("access_token");
    return res.status(401).json({ valid: false, message: "Session expired" });
  }
};