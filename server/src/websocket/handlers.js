// websocket/handlers.js

/**
 * Called once per Redis pub/sub message.
 * Parses the raw Redis message, finds the correct io room,
 * and emits the right event to connected clients.
 *
 * @param {import("socket.io").Server} io
 * @param {string} channel  - Redis channel name e.g. "channel:positions:9158"
 * @param {string} rawMessage - Raw JSON string from Redis
 */
export const handleChannelMessage = (io, channel, rawMessage) => {
  let payload;

  try {
    payload = JSON.parse(rawMessage);
  } catch (err) {
    console.error(`[WS] Failed to parse message on channel "${channel}":`, err.message);
    return;
  }

  const { event, sessionKey, room, data, timestamp } = payload;

  if (!event || (!sessionKey && !room)) {
    console.warn(`[WS] Malformed payload on channel "${channel}":`, payload);
    return;
  }

  // Room name matches what clients join on connect
  const resolvedRoom = room ?? `session:${sessionKey}`;

  // How many clients are in this room right now
  const clientCount = io.sockets.adapter.rooms.get(resolvedRoom)?.size ?? 0;

  if (clientCount === 0) {
    // Nobody listening — skip emit (poller will be stopped separately)
    return;
  }

  io.to(resolvedRoom).emit(event, { data, timestamp, sessionKey });

  console.log(`[WS] → ${event} to room "${resolvedRoom}" (${clientCount} clients)`);
};