import { Server } from "socket.io";
import { redisSubscriber } from "../db/redis.js";
import { CHANNELS } from "../services/cache.service.js";
import { handleChannelMessage } from "./handlers.js";

let io;

// Official livetiming topics we forward to frontend clients
const LIVETIMING_TOPICS = [
  "Heartbeat",
  "CarData.z",
  "Position.z",
  "ExtrapolatedClock",
  "TopThree",
  "TimingStats",
  "TimingAppData",
  "WeatherData",
  "TrackStatus",
  "DriverList",
  "RaceControlMessages",
  "SessionInfo",
  "SessionData",
  "LapCount",
  "TimingData",
];

export const initWebSocket = (httpServer) => {

  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "development" 
        ? "http://localhost:5173" 
        : process.env.CLIENT_URL,   
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Subscribe once on startup to all livetiming Redis channels.
  for (const topic of LIVETIMING_TOPICS) {
    const channel = CHANNELS.livetiming(topic);
    redisSubscriber.subscribe(channel, (message) => {
      handleChannelMessage(io, channel, message);
    });
  }
  console.log(`[WS] Subscribed to livetiming channels (${LIVETIMING_TOPICS.length} topics)`);

  io.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Frontend subscribes to official live timing stream
    socket.on("join:livetiming", async () => {
      const room = "livetiming";
      await socket.join(room);
      socket.emit("joined:livetiming", { room, message: "Joined official live timing stream." });
      console.log(`[WS] ${socket.id} joined room "${room}"`);
    });

    socket.on("leave:livetiming", async () => {
      const room = "livetiming";
      await socket.leave(room);
      console.log(`[WS] ${socket.id} left room "${room}"`);
    });

    socket.on("disconnect", async (reason) => {
      console.log(`[WS] Client disconnected: ${socket.id} (${reason})`);
    });

    socket.on("ping", () => {
      socket.emit("pong", { timestamp: new Date().toISOString() });
    });
  });

  console.log("✅ WebSocket server initialised");
  return io;
};

export { io };