import { io } from "../websocket/index.js";

export const processF1WebsocketData = (topic, data, timestamp) => {
  if (!io) {
    return;
  }

  // Emit on the same room used by the Home page (join:livetiming)
  const room = "livetiming";
  const eventName = typeof topic === "string" ? `livetiming:${topic}` : topic;

  const clientCount = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  if (clientCount === 0) {
    return;
  }

  io.to(room).emit(eventName, { data, timestamp });
  
  // Optional log to see emissions in server console, comment out if it's too noisy
  // console.log(`[WS] → ${topic} to room "${room}" (${clientCount} clients)`);
};
