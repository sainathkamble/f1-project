// services/cache.service.js
import { redisClient } from "../db/redis.js";

// ─── TTL Constants (in seconds) ───────────────────────────────────────────────
export const TTL = {
  SESSIONS:    60 * 60,       // 1 hour  — rarely changes
  DRIVERS:     60 * 60,       // 1 hour  — static per session
  RESULTS:     60 * 30,       // 30 min  — finalized after race
  STANDINGS:   60 * 15,       // 15 min  — updates after each race
  WEATHER:     30,            // 30 sec  — slow changing
  RACE_CONTROL: 10,           // 10 sec  — event driven
  POSITIONS:   5,             // 5 sec   — hot real-time
  TELEMETRY:   5,             // 5 sec   — hot real-time per driver
  RADIO:       60 * 2,        // 2 min   — archival
};

// ─── Key Factories ─────────────────────────────────────────────────────────────
// Centralised so key naming is never inconsistent across files
export const KEYS = {
  sessions:     ()                       => `f1:sessions`,
  drivers:      (sessionKey)             => `f1:drivers:${sessionKey}`,
  results:      (sessionKey)             => `f1:results:${sessionKey}`,
  standings:    (year)                   => `f1:standings:${year}`,
  positions:    (sessionKey)             => `f1:positions:${sessionKey}`,
  telemetry:    (sessionKey, driverNum)  => `f1:telemetry:${sessionKey}:${driverNum}`,
  weather:      (sessionKey)             => `f1:weather:${sessionKey}`,
  raceControl:  (sessionKey)             => `f1:racecontrol:${sessionKey}`,
  radio:        (sessionKey)             => `f1:radio:${sessionKey}`,
};

// ─── Channel Factories (for Pub/Sub) ──────────────────────────────────────────
// These are the Redis pub/sub channel names the WS server will subscribe to
export const CHANNELS = {
  positions:    (sessionKey) => `channel:positions:${sessionKey}`,
  telemetry:    (sessionKey) => `channel:telemetry:${sessionKey}`,
  weather:      (sessionKey) => `channel:weather:${sessionKey}`,
  raceControl:  (sessionKey) => `channel:racecontrol:${sessionKey}`,
  radio:        (sessionKey) => `channel:radio:${sessionKey}`,
  livetiming:   (topic)      => `channel:livetiming:${topic}`,
};

// ─── Core Helpers ──────────────────────────────────────────────────────────────

/**
 * Get a cached value by key.
 * Returns parsed JSON or null if key doesn't exist / expired.
 */
export const getCache = async (key) => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error(`[Cache] GET failed for key "${key}":`, err.message);
    return null;
  }
};

/**
 * Set a value in cache with a TTL (in seconds).
 * Value is automatically serialized to JSON.
 */
export const setCache = async (key, value, ttl) => {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error(`[Cache] SET failed for key "${key}":`, err.message);
  }
};

/**
 * Delete a key from cache.
 */
export const deleteCache = async (key) => {
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error(`[Cache] DEL failed for key "${key}":`, err.message);
  }
};

/**
 * Publish a message to a Redis pub/sub channel.
 * The WebSocket server subscribes to these channels and emits to clients.
 */
export const publishToChannel = async (channel, data) => {
  try {
    await redisClient.publish(channel, JSON.stringify(data));
  } catch (err) {
    console.error(`[Cache] PUBLISH failed for channel "${channel}":`, err.message);
  }
};

/**
 * Cache-aside helper for REST routes.
 * Tries cache first → on miss, calls fetchFn() → stores result → returns data.
 *
 * Usage:
 *   const data = await withCache(KEYS.sessions(), TTL.SESSIONS, () => openF1Service.getSessions())
 */
export const withCache = async (key, ttl, fetchFn) => {
  const cached = await getCache(key);
  if (cached) {
    console.log(`[Cache] HIT → ${key}`);
    return cached;
  }

  console.log(`[Cache] MISS → ${key}, fetching fresh...`);
  const fresh = await fetchFn();

  if (fresh) {
    await setCache(key, fresh, ttl);
  }

  return fresh;
};

/**
 * Diff checker for polling jobs.
 * Compares new data with what's currently in Redis.
 * Returns true if data has changed (should publish), false if identical.
 *
 * Uses JSON.stringify for deep comparison — good enough for F1 API payloads.
 */
export const hasChanged = async (key, newData) => {
  const cached = await getCache(key);
  if (!cached) return true; // nothing cached yet → treat as changed
  return JSON.stringify(cached) !== JSON.stringify(newData);
};