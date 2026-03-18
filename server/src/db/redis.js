// db/redis.js
import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Main client — used for get / set / del / expire
const redisClient = createClient({ url: REDIS_URL });

// Dedicated subscriber client — Redis requires a separate
// connection when a client is in subscribe mode
const redisSubscriber = createClient({ url: REDIS_URL });

const connectRedis = async () => {
  try {
    await redisClient.connect();
    await redisSubscriber.connect();
    console.log("✅ Redis clients connected");
    return true;
  } catch (err) {
    console.error("❌ Redis connection failed:", err);
    return false;
  }
};

redisClient.on("error", (err) => console.error("Redis client error:", err));
redisSubscriber.on("error", (err) => console.error("Redis subscriber error:", err));

export { redisClient, redisSubscriber, connectRedis };