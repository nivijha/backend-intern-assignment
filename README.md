# Backend Intern Assignment

End-to-end sensor monitoring backend (Express + MongoDB/Mongoose) with an Expo React Native mobile frontend. Ingests encrypted gateway packets, decrypts and decodes binary sensor payloads, stores readings and alerts, evaluates alert rules (over-temperature, inactivity, offline) on historical device timestamps, and provides device/reading/alert APIs plus a mobile client.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Setup & Installation](#setup--installation)
- [Running the Backend](#running-the-backend)
- [Running the Mobile App](#running-the-mobile-app)
- [Running Tests](#running-tests)
- [Packet Replay](#packet-replay)
- [API Reference](#api-reference)
- [Alert Rules](#alert-rules)
- [Project Structure](#project-structure)
- [Known Assumptions & Limitations](#known-assumptions--limitations)

## Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)
- npm
- (Mobile only) Expo CLI / Expo Go or a simulator

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. **Never commit `.env`** — it is ignored by `.gitignore`.

```powershell
Copy-Item .env.example .env
```

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/backend-intern-assignment` |
| `AES_KEY` | 32-byte hex key (64 hex chars) for AES-256-GCM decryption | `a1b2c3...` (64 chars) |

Generate an `AES_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Setup & Installation

```powershell
# Install backend dependencies
npm install

# (Optional) Install mobile dependencies
npm run mobile:install
```

## Running the Backend

Development (auto-reload via nodemon):

```powershell
npm run dev
```

Production:

```powershell
npm start
```

The server starts on `http://localhost:3000` (or your `PORT`). It connects to MongoDB, starts the offline-alert scheduler (60-second interval), and listens for HTTP requests.

### Health check

```powershell
curl http://localhost:3000/api/health
# {"status":"ok","service":"backend-intern-assignment","timestamp":"..."}
```

## Running the Mobile App

Start the backend first, then the Expo dev server:

```powershell
# Start backend (in one terminal)
npm run dev

# Start Expo dev server (in another terminal)
npm run mobile:start
```

This opens the Expo Dev Tools. Press:
- `a` — Android emulator
- `i` — iOS simulator (macOS only)
- `w` — web browser

Or scan the QR code with Expo Go on a physical device (same network).

### Mobile configuration

The API base URL is in `mobile/app.json` under `expo.extra.apiUrl` (`http://10.0.2.2:3000` for Android emulator). On web, `EXPO_PUBLIC_API_URL` (set in `mobile/.env`) overrides to `http://localhost:3000`.

| Platform | URL to use |
|----------|------------|
| Android Emulator | `http://10.0.2.2:3000` |
| iOS Simulator | `http://localhost:3000` |
| Physical Device | Your computer's LAN IP, e.g. `http://192.168.1.50:3000` |
| Web | `http://localhost:3000` |

## Running Tests

```powershell
npm test
```

- Jest runs all suites **serially** (`maxWorkers: 1`) because DB-backed suites share one database.
- Tests run against a **dedicated test database** (`backend_intern_assignment_test`) via `tests/jest.setup.js`; the development database is never dropped or cleared.
- Expected baseline: **5 suites, 113 tests, 0 failures**.

Coverage report is written to `coverage/`.

## Packet Replay

The replay script reads `encrypted_packets.json` and posts each packet to `POST /api/ingest` in `sentAt` order, preserving the original timestamps (historical-time handling — no system-clock mixing).

The dataset contains **1,574 packets** from 5 devices, captured 2026-10-05 06:00–07:00 UTC.

```powershell
# Run at recorded speed (1x — takes ~1 hour)
node scripts/replay.js

# Run faster (speed multiplier; replay completed in ~15 minutes at 500x)
node scripts/replay.js --speed 500

# Options:
#   --api <url>     API base URL (default: http://localhost:3000)
#   --speed <n>     Speed multiplier (default: 1)
#   --limit <n>     Limit number of records to replay
```

The replay is idempotent: re-sending an already-ingested packet returns `200` (duplicate) and creates no new reading. Duplicate packets within the dataset (same `deviceId` + `sequence` + `deviceTimestamp` within a 2-minute window) are detected and rejected.

### Reference reconciliation

`scripts/reconcile.js` verifies every replayed packet against `decrypted_packets.json` by decoding the 256-byte payload and matching readings on `deviceId` + `sequence` + `deviceTimestamp`. It reports created/duplicate/rejected counts and any field mismatches.

```powershell
node scripts/reconcile.js
# Expected: 1,041 unique readings matched, 0 missing, 0 mismatches, 0 extra
```

## API Reference

Base URL: `http://localhost:3000/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check → `{ status, service, timestamp }` |
| `POST` | `/api/ingest` | Ingest an encrypted packet → creates raw/decrypted records, reading, device (upsert), and evaluates alerts |
| `POST` | `/api/devices` | Register a device (`deviceId`, `label`, optional `location`, `installationDate`) |
| `GET` | `/api/devices` | List all devices with latest reading and open-alert status |
| `GET` | `/api/devices/:id` | Device details with latest reading |
| `GET` | `/api/devices/:id/readings` | Paginated readings (query: `page`, `limit`, `from`, `to`) |
| `GET` | `/api/alerts` | List alerts (query: `status=open\|acknowledged\|all`) |
| `PATCH` | `/api/alerts/:id` | Acknowledge an alert |

### Packet ingestion body

```json
{
  "gatewayId": "GW-01",
  "iv": "<base64 12-byte nonce>",
  "ciphertext": "<base64 AES-256-GCM ciphertext>",
  "tag": "<base64 16-byte auth tag>"
}
```

### Device registration body

```json
{
  "deviceId": 70001,
  "label": "SN-70001",
  "location": "Room 101",
  "installationDate": "2026-10-01T00:00:00Z"
}
```

### Readings query parameters

- `page` (default 1), `limit` (default 50, max 200)
- `from` / `to` (ISO 8601) for date-range filtering

## Alert Rules

| Rule | Trigger | Details |
|------|---------|---------|
| **Over-temperature** | Temperature > 40.00°C | One open alert per device; new alert allowed after acknowledgement |
| **Inactivity** | Average activity score < 50 over the last 60 minutes | Evaluated on each ingested reading |
| **Offline** | No reading in the last 30 minutes | Evaluated every 60 seconds by the scheduler |

Alert engine uses `deviceTimestamp` from packets for all time-window calculations (historical-time handling). Replay preserves original timestamps — no system-clock mixing.

A partial unique index on `Alert` (`deviceId` + `type`, `partialFilterExpression: { acknowledged: false }`) prevents duplicate open alerts per device/type while allowing a new alert after the previous one is acknowledged.

## Project Structure

```
backend-intern-assignment/
├── src/
│   ├── app.js              # Express app, middleware, routes, health endpoint
│   ├── config/db.js        # Mongoose connection
│   ├── server.js           # Entry point: env, DB connect, scheduler, graceful shutdown
│   ├── models/
│   │   ├── Alert.js        # Alert schema + partial unique index
│   │   ├── Device.js       # Device schema
│   │   ├── Reading.js      # Reading schema
│   │   ├── RawPacket.js    # Raw (encrypted) packet storage
│   │   └── DecryptedPacket.js  # Decrypted plaintext storage
│   ├── routes/
│   │   ├── alertRoutes.js
│   │   ├── deviceRoutes.js
│   │   ├── ingestRoutes.js
│   │   └── readingRoutes.js
│   └── services/
│       ├── activity.js     # Activity score calculation
│       ├── alertEvaluation.js  # Alert rules (over-temp, inactivity, offline)
│       ├── alertService.js     # Alert list / acknowledge
│       ├── decoder.js      # 256-byte binary packet decoder
│       ├── decrypt.js      # AES-256-GCM decryption
│       ├── deviceService.js
│       ├── ingestService.js    # Packet ingestion pipeline
│       ├── readingService.js   # Paginated readings
│       └── scheduler.js    # 60-second offline-alert scheduler
├── scripts/
│   ├── replay.js           # Packet replay to POST /api/ingest
│   └── reconcile.js        # Reference reconciliation against decrypted_packets.json
├── tests/
│   ├── health.test.js
│   ├── phase2.test.js      # Decryption + packet decoding
│   ├── phase3.test.js      # Activity + ingestion + /api/ingest
│   ├── phase4.test.js      # Device/Reading/Alert APIs
│   ├── phase5.test.js      # Alert engine + deduplication
│   ├── fixtures.js         # Test packet fixtures
│   └── jest.setup.js       # Routes tests to dedicated test database
├── mobile/
│   ├── App.js              # Navigation (Devices → Device Detail, Alerts)
│   ├── app.json            # Expo config + API URL
│   ├── .env                # EXPO_PUBLIC_API_URL for web
│   └── src/
│       ├── api/client.js   # API client (timeout, AbortController, error mapping)
│       ├── screens/
│       │   ├── DeviceListScreen.js
│       │   ├── DeviceDetailScreen.js
│       │   └── AlertsScreen.js
│       └── components/
│           ├── LoadingState.js
│           └── ErrorState.js
├── .env                    # Local secrets (gitignored — never commit)
├── .env.example            # Template (safe to commit)
├── .gitignore
├── jest.config.js          # Serial execution + dedicated test DB
├── package.json
└── README.md
```

## Known Assumptions & Limitations

- No authentication/authorization on the backend API.
- No offline caching or push notifications in the mobile app.
- Mobile app requires network connection; Android emulator uses `10.0.2.2` special IP.
- Historical-time replay is not exposed in the mobile UI (backend-only).
- The mobile app reads `EXPO_PUBLIC_API_URL` on web; `app.json extra.apiUrl` on native.
- Replay dataset: 1,574 packets from 5 devices (IDs 70001–70005), 2026-10-05 06:00–07:00 UTC.
- All 5 devices are offline relative to the current date (last readings are from 2026-10-05), so offline alerts are expected for all devices.

## Verification Checklist

- [ ] Backend starts: `npm run dev` → "Server running on port 3000"
- [ ] Health check: `GET /api/health` → 200
- [ ] Tests pass: `npm test` → 113 passed, 0 failed
- [ ] Mobile ESLint passes: `cd mobile && npx eslint src --max-warnings 0`
- [ ] Replay completes: `node scripts/replay.js --speed 500`
- [ ] Reconciliation passes: `node scripts/reconcile.js`
- [ ] Device list loads 5 devices from `GET /api/devices`
- [ ] Device detail + readings load from `GET /api/devices/:id` and `/readings`
- [ ] Alerts load and acknowledge via `GET /api/alerts` + `PATCH /api/alerts/:id`

## Git Hygiene

- `.env` is in `.gitignore` — never commit secrets.
- `node_modules/`, `coverage/`, `*.log` ignored.
- `Sample Database Guide.pdf` is ignored (reference material).
- Repository must remain private.
