import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

export const register = async (req, res) => {
  try {
    const { email, username, password, avatar } = req.body; // 👈 destructure avatar

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(400).json({ message: "Email or username already taken" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      username,
      password: hashed,
      avatar: avatar || "", // 👈 save it
    });

    const access_token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("access_token", access_token, COOKIE_OPTIONS);
    res.status(201).json({
      message: "Registered successfully",
      user: { id: user._id, email, username, avatar: user.avatar },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: usernameOrEmail }, { username: usernameOrEmail }],
    });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const access_token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("access_token", access_token, COOKIE_OPTIONS);
    res.status(200).json({
      message: "Logged in successfully",
      user: { id: user._id, email: user.email, username: user.username },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

export const logout = (req, res) => {
  res.clearCookie("access_token", COOKIE_OPTIONS);
  res.status(200).json({ message: "Logged out successfully" });
};

export const session = async (req, res) => {
  // req.user is already attached by verifyToken middleware
  res.status(200).json({ valid: true, user: req.user });
};

export const getProfile = async (req, res) => {
  // req.user already attached by verifyToken middleware
  res.status(200).json({
    id: req.user._id,
    email: req.user.email,
    username: req.user.username,
    avatar: req.user.avatar,
  });
};

export const editProfile = async (req, res) => {
  try {
    const { username, email, avatar, currentPassword, newPassword } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // check for duplicates only if changed
    if (username && username !== user.username) {
      const exists = await User.findOne({ username });
      if (exists) return res.status(400).json({ message: "Username already taken" });
    }

    if (email && email !== user.email) {
      const exists = await User.findOne({ email });
      if (exists) return res.status(400).json({ message: "Email already taken" });
    }

    // if changing password, verify current password first
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required to set a new one" });
      }
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      user.password = await bcrypt.hash(newPassword, 12);
    }

    if (username) user.username = username;
    if (email) user.email = email;
    if (avatar) user.avatar = avatar;

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};