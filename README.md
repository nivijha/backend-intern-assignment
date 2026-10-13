# Backend Intern Assignment — Phase 1

Clean, testable backend foundation with Node.js, Express.js, MongoDB, and Mongoose.

## Prerequisites

- Node.js >= 18
- MongoDB (local or Atlas)
- npm

## Installation

```powershell
npm install
```

## Environment Variables

Copy the example file and fill in your values:

```powershell
Copy-Item .env.example .env
```

Required variables in `.env`:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/backend-intern-assignment` |
| `AES_KEY` | 32-byte hex key for AES-256 (Phase 2) | `a1b2c3d4e5f6...` (64 hex chars) |

Generate `AES_KEY`:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Start MongoDB

**Local (Windows):**
```powershell
mongod
```

**MongoDB Atlas:** Use the connection string from Atlas dashboard in `MONGODB_URI`.

## Run the Backend

Development (auto-reload):
```powershell
npm run dev
```

Production:
```powershell
npm start
```

Server starts on `http://localhost:3000` (or your `PORT`).

## Run Tests

```powershell
npm test
```

Tests run against the Express app directly — **no live MongoDB required**.

## Project Structure

```
src/
├── config/
│   └── db.js         # MongoDB connection logic
├── app.js            # Express app: middleware, routes (health check)
└── server.js         # Entry point: loads env, connects DB, starts HTTP server
tests/
└── health.test.js    # Supertest + Jest tests for GET /api/health
```

### File Responsibilities

| File | Purpose |
|------|---------|
| `src/config/db.js` | Exports `connectDB()` — reads `MONGODB_URI` from env, connects via Mongoose, throws clear error if URI missing |
| `src/app.js` | Creates Express app, adds CORS + JSON parsing, defines `GET /api/health` → `{ status, service, timestamp }` |
| `src/server.js` | Loads `.env`, calls `connectDB()`, starts HTTP server **only after DB succeeds**, handles graceful shutdown |

## Health Check Endpoint

```
GET /api/health
```

Response (200 OK):
```json
{
  "status": "ok",
  "service": "backend-intern-assignment",
  "timestamp": "2026-10-12T16:30:00.000Z"
}
```

## Git Hygiene

- `.env` is in `.gitignore` — never committed
- `node_modules/` and `coverage/` ignored
- Repository must remain private