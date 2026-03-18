import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createServer } from "http";
import { initWebSocket } from "./websocket/index.js";
import { connectRedis } from "./db/redis.js";

const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: process.env.NODE_ENV === "development" ? "http://localhost:5173" : process.env.CLIENT_URL,
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

export async function startHttpServer() {
  const redisOk = await connectRedis();
  if (!redisOk) {
    console.warn("⚠️ Redis is unavailable. Websocket live events will not stream, but API routes still run.");
  }

  initWebSocket(httpServer); // ← pass httpServer, NOT app

  const port = process.env.PORT || 8000;
  await new Promise((resolve) => httpServer.listen(port, resolve));
  console.log(`⚙️ Server is running at port : ${port}`);
}

export { app, httpServer };