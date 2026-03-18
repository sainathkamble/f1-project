import axios from "axios";
import WebSocket from "ws";
import zlib from "zlib";
import { publishToChannel } from "../services/cache.service.js";
import { CHANNELS } from "../services/cache.service.js";

// Topics we subscribe to from the official F1 live timing websocket
export const LIVETIMING_TOPICS = [
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

function decompressMaybe(topic, data) {
  if (!topic || !topic.endsWith(".z") || typeof data !== "string") return Promise.resolve(data);

  return new Promise((resolve) => {
    const buf = Buffer.from(data, "base64");
    zlib.inflate(buf, (err, result) => {
      if (!err) {
        try {
          resolve(JSON.parse(result.toString()));
        } catch {
          resolve(data);
        }
        return;
      }

      zlib.inflateRaw(buf, (err2, result2) => {
        if (!err2) {
          try {
            resolve(JSON.parse(result2.toString()));
          } catch {
            resolve(data);
          }
          return;
        }

        resolve(data);
      });
    });
  });
}

async function negotiate() {
  const hub = encodeURIComponent(JSON.stringify([{ name: "Streaming" }]));
  const url = `https://livetiming.formula1.com/signalr/negotiate?connectionData=${hub}&clientProtocol=1.5`;

  const resp = await axios.get(url, {
    headers: {
      "User-Agent": "BestHTTP",
      "Accept-Encoding": "gzip, identity",
    },
  });

  const token = resp.data.ConnectionToken;
  const cookie = resp.headers["set-cookie"] ? resp.headers["set-cookie"].join("; ") : "";
  return { token, cookie };
}

async function connectAndStream({ token, cookie, onTopic }) {
  const hub = encodeURIComponent(JSON.stringify([{ name: "Streaming" }]));
  const encodedToken = encodeURIComponent(token);
  const url = `wss://livetiming.formula1.com/signalr/connect?clientProtocol=1.5&transport=webSockets&connectionToken=${encodedToken}&connectionData=${hub}`;

  const sock = new WebSocket(url, {
    headers: {
      "User-Agent": "BestHTTP",
      "Accept-Encoding": "gzip,identity",
      Cookie: cookie,
    },
  });

  sock.on("open", () => {
    const subscribeMsg = JSON.stringify({
      H: "Streaming",
      M: "Subscribe",
      A: [LIVETIMING_TOPICS],
      I: 1,
    });
    sock.send(subscribeMsg);
  });

  sock.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // keep-alive response
      if (msg.C && !msg.M && !msg.R) return;

      // initial snapshot
      if (msg.R && msg.I === "1" && typeof msg.R === "object") {
        for (const [topic, data] of Object.entries(msg.R)) {
          if (!data) continue;
          const decoded = await decompressMaybe(topic, data);
          await onTopic(topic, decoded, null);
        }
        return;
      }

      if (msg.M && Array.isArray(msg.M)) {
        for (const item of msg.M) {
          if (item.H === "streaming" && item.M === "feed") {
            const [topic, data, timestamp] = item.A;
            const decoded = await decompressMaybe(topic, data);
            await onTopic(topic, decoded, timestamp);
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  });

  const pingInterval = setInterval(() => {
    if (sock.readyState === WebSocket.OPEN) sock.send("{}");
  }, 5000);

  sock.on("close", () => clearInterval(pingInterval));
  sock.on("error", () => {});

  return sock;
}

/**
 * Starts official F1 live timing websocket and forwards messages to frontend via Redis pub/sub.
 * Frontend clients should join the Socket.IO room "livetiming".
 */
export async function startLiveTimingForwarder() {
  const loop = async () => {
    const { token, cookie } = await negotiate();

    await connectAndStream({
      token,
      cookie,
      onTopic: async (topic, data, timestamp) => {
        console.debug(`[LiveTiming] topic: ${topic}, dataType: ${typeof data}, dataLen: ${Array.isArray(data) ? data.length : data ? Object.keys(data).length : 0}`);
        const ts = timestamp || new Date().toISOString();
        await publishToChannel(CHANNELS.livetiming(topic), {
          event: `livetiming:${topic}`,
          room: "livetiming",
          data,
          timestamp: ts,
        });
      },
    });
  };

  // keep reconnecting forever
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await loop();
      // if the socket closes, connectAndStream returns but no exception.
      // wait a bit before retrying
      await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      console.error("[LiveTiming] Forwarder error:", err?.message ?? err);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

