# F1 SYNC ⚡

> A data-obsessed Formula 1 companion built for fans who want more than just race results. Live timing, real-time telemetry, driver standings, constructor battles, team radio — all streamed in real-time through a WebSocket pipeline backed by Redis Pub/Sub.

**🔗 Live App:** [https://f1sync.vercel.app](https://f1sync.vercel.app)  
**📡 API Server:** [https://f1server-axse.onrender.com](https://f1server-axse.onrender.com)

---

## What is this?

F1 Sync is a full-stack real-time web application that aggregates live Formula 1 data from the official F1 SignalR stream and the OpenF1 API, runs it through a Redis-backed caching and pub/sub layer, and pushes it to connected clients over WebSockets. On the surface it's a clean, dark-themed F1 dashboard. Under the hood it's a data pipeline built to handle high-frequency telemetry, race control messages, driver positions, and live timing — all without hammering upstream APIs.

Users can create an account, log in, and get a seamless authenticated experience across the app. JWT tokens live in HTTP-only cookies — no localStorage, no exposure.

---

## 🗂️ Monorepo Structure

```
f1sync/
├── client/          # React + TypeScript + Vite frontend
└── server/          # Node.js + Express + Socket.IO backend
```

---

## ⚙️ Tech Stack

### Frontend
| | |
|---|---|
| React 18 + TypeScript | Component architecture with full type safety |
| Vite | Lightning-fast dev server and optimised production builds |
| React Router v6 | Client-side routing with protected route support |
| Tailwind CSS | Utility-first styling — zero custom CSS files |
| Socket.IO Client | WebSocket connection to live timing server |
| Context API | Global user session state (`UserContext`) |

### Backend
| | |
|---|---|
| Node.js + Express | REST API server with modular route/controller architecture |
| Socket.IO | WebSocket server with Redis-backed room broadcasting |
| MongoDB + Mongoose | User persistence — credentials, profiles, avatars |
| Redis | Dual-purpose: cache store + Pub/Sub message broker |
| OpenF1 API | Polling source for positions, telemetry, weather, radio |
| F1 SignalR Stream | Official live timing WebSocket — 14 real-time topics |
| JWT + cookie-parser | Stateless auth via signed HTTP-only cookies |

---

## 🔐 Auth Flow

Authentication is JWT-based with tokens stored exclusively in HTTP-only cookies — never exposed to JavaScript, never in `localStorage`.

```
User submits login form
        ↓
POST /v1/auth/login
        ↓
Server validates credentials → signs JWT → sets access_token cookie (HttpOnly)
        ↓
All subsequent API calls automatically carry the cookie
        ↓
verifyToken middleware validates JWT on every protected route
        ↓
POST /v1/auth/logout → clears cookie → session destroyed
```

**Register → Login → Browse → Logout** — the full session lifecycle is stateless on the server side. MongoDB stores user data (username, hashed password, avatar). Redis is never involved in auth — it's purely for F1 data.

### Auth Endpoints

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/v1/auth/session` | ✅ | Check whether user has a valid `access_token` cookie |
| `POST` | `/v1/auth/register` | ❌ | Create a new account |
| `POST` | `/v1/auth/login` | ❌ | Login — issues `access_token` HTTP-only cookie |
| `POST` | `/v1/auth/logout` | ✅ | Logout — clears cookie |
| `GET` | `/v1/auth/profile` | ✅ | Fetch authenticated user profile |
| `POST` | `/v1/auth/profile/edit` | ✅ | Edit user profile |

---

## 🏎️ F1 Data API

All F1 data routes require a valid `access_token` cookie. All responses are Redis cache-aside — first request hits the upstream API and populates cache, subsequent requests are served from Redis until TTL expires.

### Drivers

| Method | Route | Description |
|---|---|---|
| `GET` | `/v1/drivers` | All current season drivers |
| `GET` | `/v1/drivers/standings` | Driver championship standings |
| `GET` | `/v1/driver:driverId` | Driver details by `driverId` |
| `GET` | `/v1/driver-map:season` | All drivers in a specific season |

### Constructors

| Method | Route | Description |
|---|---|---|
| `GET` | `/v1/constructors` | All F1 constructors/teams |
| `GET` | `/v1/constructors/standings` | Constructor championship standings |

### Schedule

| Method | Route | Description |
|---|---|---|
| `GET` | `/v1/schedule` | Full F1 season race calendar |

> ✅ = Requires valid JWT in `access_token` cookie

---

## ⚡ Real-Time Data Pipeline

This is the interesting part. Live F1 data flows through two parallel pipelines before reaching the browser.

### Pipeline 1 — Official Live Timing (SignalR)

```
F1 Official SignalR WebSocket
          ↓
livetiming.controller.js  (persistent connection, message forwarder)
          ↓
Redis Pub/Sub  →  channel:livetiming:<topic>
          ↓
websocket/index.js  (subscribed at startup, 14 topics)
          ↓
io.to("livetiming").emit(topic, payload)
          ↓
All clients in the "livetiming" room
```

Topics streamed: `Heartbeat` · `CarData.z` · `Position.z` · `ExtrapolatedClock` · `TopThree` · `TimingStats` · `TimingAppData` · `WeatherData` · `TrackStatus` · `DriverList` · `RaceControlMessages` · `SessionInfo` · `SessionData` · `LapCount` · `TimingData`

### Pipeline 2 — OpenF1 Polling

```
polling.service.js  (per-session, staggered intervals)
          ↓
OpenF1 REST API  (fetches only new data via `since` timestamp)
          ↓
hasChanged()  →  JSON diff against current Redis cache
          ↓  (only if data changed)
setCache()  +  publishToChannel()
          ↓
websocket/handlers.js  →  io.to("session:<key>").emit(event, data)
          ↓
Clients subscribed to that session room
```

Pollers use a `lastPolledAt` cursor per data type, so each request only fetches entries newer than the previous poll — keeping upstream payloads small even at 5-second intervals.

---

## 🗄️ Redis Caching Layer

Every F1 data type has a purpose-tuned TTL:

| Data | Cache Key | TTL | Rationale |
|---|---|---|---|
| Sessions | `f1:sessions` | 60 min | Static per season |
| Drivers | `f1:drivers:<sessionKey>` | 60 min | Doesn't change mid-session |
| Results | `f1:results:<sessionKey>` | 30 min | Finalised post-race |
| Standings | `f1:standings:<year>` | 15 min | Updates after each race |
| Weather | `f1:weather:<sessionKey>` | 30 sec | Slow-changing |
| Race Control | `f1:racecontrol:<sessionKey>` | 10 sec | Event-driven, important |
| Positions | `f1:positions:<sessionKey>` | 5 sec | Hot real-time |
| Telemetry | `f1:telemetry:<sessionKey>:<driver>` | 5 sec | Hot real-time per driver |
| Team Radio | `f1:radio:<sessionKey>` | 2 min | Archival |

The `withCache()` helper wraps every data fetch — checks Redis first, on miss calls the upstream API, stores result, returns data. One function, zero boilerplate.

---

## 📡 Redis Pub/Sub Channels

| Channel | Published by | Consumed by | Client event |
|---|---|---|---|
| `channel:positions:<sessionKey>` | polling.service | websocket/handlers | `positions:update` |
| `channel:telemetry:<sessionKey>` | polling.service | websocket/handlers | `telemetry:update` |
| `channel:weather:<sessionKey>` | polling.service | websocket/handlers | `weather:update` |
| `channel:racecontrol:<sessionKey>` | polling.service | websocket/handlers | `racecontrol:update` |
| `channel:radio:<sessionKey>` | polling.service | websocket/handlers | `radio:new` |
| `channel:livetiming:<topic>` | livetiming.controller | websocket/index | `<topic>` |

---

## 🔄 Polling Internals

Per-session pollers are staggered on startup to avoid a thundering herd against OpenF1:

| Data Type | Interval | Start Delay |
|---|---|---|
| Positions | 5s | 0ms |
| Telemetry | 5s | 600ms |
| Weather | 60s | 1200ms |
| Race Control | 60s | 1800ms |
| Team Radio | 60s | 2400ms |

Each poller only fires a publish if `hasChanged()` returns true — deep JSON comparison against the current cached value. Silent updates cost nothing.

---

## 🌐 WebSocket API (Socket.IO)

### Client → Server

| Event | Description |
|---|---|
| `join:livetiming` | Subscribe to official F1 live timing room |
| `leave:livetiming` | Unsubscribe from live timing room |
| `ping` | Heartbeat — server responds with `pong` |

### Server → Client

| Event | Payload |
|---|---|
| `positions:update` | `{ data: { [driverNum]: latestPosition }, timestamp, sessionKey }` |
| `telemetry:update` | `{ data: { [driverNum]: telemetry }, timestamp, sessionKey }` |
| `weather:update` | `{ data: weatherSnapshot, timestamp, sessionKey }` |
| `racecontrol:update` | `{ data: newMessages[], timestamp, sessionKey }` |
| `radio:new` | `{ data: radioClips[], timestamp, sessionKey }` |
| F1 timing topics | `{ data, timestamp }` — one event per SignalR topic |
| `pong` | `{ timestamp }` |

---

## 📱 Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/home` | Home | Landing dashboard |
| `/stream` | Watch Live | Live F1 stream viewer |
| `/schedule` | Schedule | Full season race calendar |
| `/drivers` | Drivers | Driver grid with stats |
| `/constructors` | Constructors | Team / constructor data |
| `/championship` | Championship | Driver + constructor standings |
| `/profile` | Profile | User profile + avatar |

---

## 🏗️ Frontend Architecture

```
src/
├── components/
│   ├── Navbar.tsx        # Responsive — hamburger drawer on mobile/tablet, full nav on desktop
│   └── Footer.tsx        # Responsive footer with portfolio + repo links
├── context/
│   └── UserContext.tsx   # Global auth state — user object, avatar, username
├── pages/                # One component per route
└── main.tsx              # Router setup, context providers
```

The Navbar collapses into a slide-in drawer on mobile and tablet (`< lg`), with staggered link animations and a backdrop overlay. Desktop layout is unchanged. Body scroll locks while the drawer is open.

---

## 🚀 Running Locally

### Prerequisites
- Node.js `v18+`
- MongoDB (local or Atlas)
- Redis (local or cloud)

### 1. Clone

```bash
git clone https://github.com/sainathkamble/f1sync.git
cd f1sync
```

### 2. Backend setup

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=8000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/f1sync
REDIS_URL=redis://localhost:6379
ACCESS_TOKEN_SECRET=your_super_secret_here
ACCESS_TOKEN_EXPIRY=1d
CLIENT_URL=http://localhost:5173
```

```bash
npm run dev
```

### 3. Frontend setup

```bash
cd client
npm install
```

Create `client/.env`:

```env
VITE_API_URL=http://localhost:8000
```

```bash
npm run dev
```

Frontend → `http://localhost:5173`  
Backend → `http://localhost:8000`

### 4. Testing on a phone

```bash
# In client/
npm run dev -- --host
```

Update `client/.env` to use your machine's LAN IP:

```env
VITE_API_URL=http://192.168.x.x:8000
```

And make your Express server bind to all interfaces:

```js
app.listen(8000, '0.0.0.0')
```

---

## 🌍 Deployment

| Layer | Platform | Notes |
|---|---|---|
| Frontend | Vercel | Auto-deploys on push to `main` |
| Backend | Render | Free tier — ~30s cold start after inactivity |
| Database | MongoDB Atlas | Free tier M0 cluster |
| Redis | Redis Cloud / Upstash | Persistent cache + Pub/Sub broker |

> **Cold start note:** Render free tier spins the server down after 15 minutes of inactivity. The first request after idle will be slow. Everything warms up after that.

---

## 🧠 Architecture Decisions Worth Noting

**Redis as the data backbone, not just a cache.** Polling, caching, and WebSocket broadcasting are three separate concerns. Redis sits between all of them — pollers write to it, the WebSocket server reads from it via Pub/Sub. Either layer can crash and restart without the other losing state.

**Diff-gated publishing.** Before any live data update gets published to a Redis channel, it's compared against the currently cached value. Identical payloads are silently dropped. This means WebSocket clients only receive a message when something actually changed — no noise, no redundant renders.

**Incremental polling with cursor timestamps.** Each OpenF1 poll request includes a `since` parameter set to the last received timestamp. The server never re-fetches data it already has, keeping request sizes minimal even at 5-second polling frequency.

**HTTP-only cookies for auth.** JWTs never touch JavaScript. No `localStorage`, no `sessionStorage`, no XSS attack surface. CORS is configured with `credentials: true` and an explicit origin allowlist so cookies flow correctly between Vercel and Render.

**Graceful Redis degradation.** If Redis is unreachable at boot, the server logs a warning and continues. REST API routes serve data normally (without caching). Only live WebSocket events are affected. The app never hard-crashes over infrastructure issues.

---

## 🔭 What's Coming

The core data pipeline is solid. These are the features currently in the works or planned next.

**🗺️ Live Track Map**
An SVG circuit map rendering each driver's real-time position on track, updated every 5 seconds via the existing `positions:update` WebSocket event. Driver markers will show team colours, current gap to leader, and tyre compound — all sourced from the live telemetry stream already flowing through the pipeline. No new infrastructure needed, just a new consumer of data that's already there.

**🤖 AI Race Predictor & Trivia Bot**
A Claude-powered in-app assistant with two modes. In **prediction mode** it ingests live session data — current positions, tyre age, pit stop history, weather, race control messages — and generates real-time strategic predictions (undercut windows, safety car impact, championship point swings). In **trivia mode** it becomes an F1 knowledge engine — ask anything from Senna's wet weather records to the 2021 Abu Dhabi tiebreaker rules and get answers grounded in actual F1 history. Both modes share a single chat interface, context-aware of whatever the user is currently watching.

---

## 👨‍💻 Author

**Sainath Kamble**

- 🌐 [sainathkamble.vercel.app](https://sainathkamble.vercel.app)
- 🐙 [github.com/sainathkamble](https://github.com/sainathkamble)

---

<p align="center">
  Built for the fans who watch the data feeds during formation lap. 🏁
</p>
