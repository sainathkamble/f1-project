import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true, // allow cookies cross-origin
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.json({ limit: "10mb" })); // 👈 increase from default 100kb
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

import userRoute from "./routes/user.route.js";
import driversRoute from "./routes/drivers.route.js";
import constructorsRoute from "./routes/constructors.route.js";
import scheduleRoute from "./routes/schedule.route.js";

app.use("/v1/auth", userRoute);
app.use("/v1", driversRoute);
app.use("/v1", constructorsRoute);
app.use("/v1", scheduleRoute);

export { app };