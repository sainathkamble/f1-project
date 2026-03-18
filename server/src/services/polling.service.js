// services/polling.service.js
import * as openF1 from "./openf1.service.js";
import {
  getCache,
  setCache,
  publishToChannel,
  hasChanged,
  KEYS,
  CHANNELS,
  TTL,
} from "./cache.service.js";

const activePollers = new Map();

const POLL_INTERVALS = {
  positions:   5000,   // 5s
  telemetry:   5000,   // 5s
  weather:     60000,  // 60s
  raceControl: 60000,  // 60s
  radio:       60000,  // 60s
};

const pollPositions = async (sessionKey) => {
  const poller = activePollers.get(sessionKey);
  if (!poller) return;

  const since = poller.lastPolledAt.positions ?? null;
  const data = await openF1.getDriverPositions(sessionKey, since);
  if (!data || data.length === 0) return;

  // Track latest timestamp for next poll's `since` param
  const latest = data[data.length - 1]?.date;
  if (latest) poller.lastPolledAt.positions = latest;

  const grouped = groupLatestByDriver(data);

  const cacheKey = KEYS.positions(sessionKey);
  const changed = await hasChanged(cacheKey, grouped);
  if (!changed) return;

  await setCache(cacheKey, grouped, TTL.POSITIONS);
  await publishToChannel(CHANNELS.positions(sessionKey), {
    event: "positions:update",
    sessionKey,
    data: grouped,
    timestamp: new Date().toISOString(),
  });
};

const pollTelemetry = async (sessionKey) => {
  const poller = activePollers.get(sessionKey);
  if (!poller) return;

  const since = poller.lastPolledAt.telemetry ?? null;
  const data = await openF1.getCarTelemetry(sessionKey, since);
  if (!data || data.length === 0) return;

  const latest = data[data.length - 1]?.date;
  if (latest) poller.lastPolledAt.telemetry = latest;

  const grouped = groupLatestByDriver(data);

  for (const [driverNum, telemetry] of Object.entries(grouped)) {
    await setCache(
      KEYS.telemetry(sessionKey, driverNum),
      telemetry,
      TTL.TELEMETRY
    );
  }

  await publishToChannel(CHANNELS.telemetry(sessionKey), {
    event: "telemetry:update",
    sessionKey,
    data: grouped,
    timestamp: new Date().toISOString(),
  });
};

const pollWeather = async (sessionKey) => {
  const poller = activePollers.get(sessionKey);
  if (!poller) return;

  const since = poller.lastPolledAt.weather ?? null;
  const data = await openF1.getWeather(sessionKey, since);
  if (!data || data.length === 0) return;

  const latest = data[data.length - 1]?.date;
  if (latest) poller.lastPolledAt.weather = latest;

  const snapshot = data[data.length - 1];

  const cacheKey = KEYS.weather(sessionKey);
  const changed = await hasChanged(cacheKey, snapshot);
  if (!changed) return;

  await setCache(cacheKey, snapshot, TTL.WEATHER);
  await publishToChannel(CHANNELS.weather(sessionKey), {
    event: "weather:update",
    sessionKey,
    data: snapshot,
    timestamp: new Date().toISOString(),
  });
};

const pollRaceControl = async (sessionKey) => {
  const poller = activePollers.get(sessionKey);
  if (!poller) return;

  const since = poller.lastPolledAt.raceControl ?? null;
  const data = await openF1.getRaceControlMessages(sessionKey, since);
  if (!data || data.length === 0) return;

  const latest = data[data.length - 1]?.date;
  if (latest) poller.lastPolledAt.raceControl = latest;

  const cacheKey = KEYS.raceControl(sessionKey);
  const existing = (await getCache(cacheKey)) ?? [];
  const merged = [...existing, ...data];
  await setCache(cacheKey, merged, TTL.RACE_CONTROL);

  await publishToChannel(CHANNELS.raceControl(sessionKey), {
    event: "racecontrol:update",
    sessionKey,
    data,                        
    timestamp: new Date().toISOString(),
  });
};

const pollRadio = async (sessionKey) => {
  const poller = activePollers.get(sessionKey);
  if (!poller) return;

  const since = poller.lastPolledAt.radio ?? null;
  const data = await openF1.getTeamRadio(sessionKey, since);
  if (!data || data.length === 0) return;

  const latest = data[data.length - 1]?.date;
  if (latest) poller.lastPolledAt.radio = latest;

  const cacheKey = KEYS.radio(sessionKey);
  const existing = (await getCache(cacheKey)) ?? [];
  const merged = [...existing, ...data];
  await setCache(cacheKey, merged, TTL.RADIO);

  await publishToChannel(CHANNELS.radio(sessionKey), {
    event: "radio:new",
    sessionKey,
    data,
    timestamp: new Date().toISOString(),
  });
};

const groupLatestByDriver = (data) => {
  return data.reduce((acc, entry) => {
    acc[entry.driver_number] = entry;
    return acc;
  }, {});
};

const sessionStartTimes = new Map();

export const startPolling = async (sessionKey) => {
  if (activePollers.has(sessionKey)) {
    console.log(`[Polling] Already running for session ${sessionKey}`);
    return;
  }

  const session = await openF1.getSessionByKey(sessionKey);
  const sessionStart = session?.date_start ?? new Date(Date.now() - 5 * 60 * 1000).toISOString(); // fallback: 5 mins ago
  sessionStartTimes.set(sessionKey, sessionStart);

  console.log(`[Polling] ▶ Starting pollers for session ${sessionKey} from ${sessionStart}`);

  const intervals = [
    setInterval(() => pollPositions(sessionKey), POLL_INTERVALS.positions),
    ...[
      [pollTelemetry,   POLL_INTERVALS.telemetry,   600],
      [pollWeather,     POLL_INTERVALS.weather,     1200],
      [pollRaceControl, POLL_INTERVALS.raceControl, 1800],
      [pollRadio,       POLL_INTERVALS.radio,       2400],
    ].map(([fn, interval, delay]) =>
      setTimeout(() =>
        setInterval(() => fn(sessionKey), interval),
        delay
      )
    ),
  ];

  // services/polling.service.js — inside startPolling()

const toCleanUtc = (isoString) =>
  new Date(isoString).toISOString().slice(0, 19); // "2026-03-13T03:30:00"

// Always start from 30 seconds ago — keeps first request tiny
const thirtySecsAgo = toCleanUtc(new Date(Date.now() - 30 * 1000).toISOString());

activePollers.set(sessionKey, {
  intervals,
  lastPolledAt: {
    positions:   thirtySecsAgo,
    telemetry:   thirtySecsAgo,
    weather:     thirtySecsAgo,
    raceControl: thirtySecsAgo,
    radio:       thirtySecsAgo,
  },
});
};

export const stopPolling = (sessionKey) => {
  const poller = activePollers.get(sessionKey);
  if (!poller) return;

  poller.intervals.forEach(clearInterval);
  activePollers.delete(sessionKey);
  console.log(`[Polling] ⏹ Stopped pollers for session ${sessionKey}`);
};

export const stopAllPolling = () => {
  for (const sessionKey of activePollers.keys()) {
    stopPolling(sessionKey);
  }
  console.log("[Polling] All pollers stopped");
};

export const getActivePollers = () => Array.from(activePollers.keys());