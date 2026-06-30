# IndiaTV

**Anonymous Random Video Chat Platform**

IndiaTV is a production-quality MVP for anonymous random video chat — no login, no signup, no authentication. Users click Start Chat, grant camera/microphone permissions, get matched with a random partner via WebRTC, and can Next, Report, Mute, or Leave at any time.

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS, React Router, Socket.io Client, WebRTC, Axios |
| Backend | Node.js, Express, Socket.io, Supabase JS, UUID |
| Database | Supabase PostgreSQL |

---

## Project Structure

```
indiaTV/
├── frontend/          # React + Vite client
├── backend/           # Express + Socket.io server
├── supabase/
│   └── migrations/    # SQL schema migrations
├── package.json       # Root scripts (dev, install)
└── .env.example       # Environment variable template
```

---

## Prerequisites

- **Node.js** 18 or higher
- **npm** 9+
- **Supabase** project ([supabase.com](https://supabase.com))

---

## Installation

```bash
# Clone or navigate to the project
cd indiaTV

# Install all dependencies (root workspace installs backend + frontend)
npm install
```

---

## Environment Variables

### 1. Backend — create `backend/.env`

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=5000
FRONTEND_URL=http://localhost:5173
```

> **Important:** Use the **Service Role Key** only on the backend. Never expose it to the frontend.

### 2. Frontend — create `frontend/.env`

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-anon-key
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

Copy values from your Supabase project: **Settings → API**.

---

## Database Setup (Supabase)

### Option A — Local Supabase (recommended for development)

Requires [Docker Desktop](https://docs.docker.com/desktop/) running.

```bash
# Start local Supabase (applies migrations automatically)
npx supabase start

# Copy credentials from output into backend/.env and frontend/.env
# API URL → SUPABASE_URL / VITE_SUPABASE_URL
# service_role key → SUPABASE_SERVICE_ROLE_KEY
# anon key → VITE_SUPABASE_PUBLISHABLE_KEY

# Reset database (re-apply migrations)
npx supabase db reset
```

### Option B — Supabase Cloud

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **SQL Editor**
3. Paste and run the contents of:

```
supabase/migrations/001_initial_schema.sql
```

4. Copy **Settings → API** credentials into your `.env` files.

---

## Integration Tests

Run the full API + Socket.io test suite:

```bash
npm run test:integration
```

Tests cover: health, stats, session lifecycle, reports, feedback, socket matching, and frontend proxy.

---

## Running Locally

```bash
npm run dev
```

This starts both servers concurrently:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000 |
| Health check | http://localhost:5000/api/health |

### Individual services

```bash
npm run dev:backend   # Backend only (port 5000)
npm run dev:frontend  # Frontend only (port 5173)
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server and database health |
| GET | `/api/stats` | Active users, queue size, matches today |
| POST | `/api/start-session` | Create anonymous session |
| POST | `/api/end-session` | End session |
| POST | `/api/report` | Submit abuse report |
| POST | `/api/feedback` | Submit post-chat feedback |

---

## Socket Events

### Client → Server

| Event | Description |
|-------|-------------|
| `join_queue` | Enter matching queue |
| `leave_queue` | Leave queue |
| `next` | Skip current partner |
| `offer` | WebRTC SDP offer |
| `answer` | WebRTC SDP answer |
| `ice_candidate` | ICE candidate exchange |
| `disconnect` | Disconnect from chat |

### Server → Client

| Event | Description |
|-------|-------------|
| `waiting` | In queue, waiting for partner |
| `matched` | Paired with partner (+ ICE servers) |
| `partner_left` | Partner disconnected or skipped |
| `searching` | Re-entering queue |
| `error` | Error message |
| `reconnect` | Session reconnected after refresh |

---

## Features

- Anonymous sessions (no auth)
- Random video chat matching
- WebRTC peer-to-peer video/audio
- Mute microphone / disable camera
- Next partner (skip)
- Report abuse (stored in Supabase)
- Connection timer and status
- Dark glassmorphism UI
- Responsive design
- Rate limiting and security headers
- Graceful shutdown
- Stale queue/match cleanup

---

## Deployment

### Backend

1. Build: `npm run build --prefix backend`
2. Set environment variables on your host
3. Start: `npm run start --prefix backend`

Recommended hosts: Railway, Render, Fly.io, AWS EC2.

### Frontend

1. Build: `npm run build --prefix frontend`
2. Deploy `frontend/dist` to Vercel, Netlify, or Cloudflare Pages
3. Set `VITE_*` env vars at build time
4. Update `FRONTEND_URL` in backend `.env` to your production frontend URL

### Supabase

- Run migrations on your production Supabase project
- Keep Service Role Key server-side only

---

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure TURN servers for NAT traversal (`STUN_SERVERS` env var)
- [ ] Enable HTTPS on frontend and backend
- [ ] Update CORS `FRONTEND_URL` to production domain
- [ ] Review Supabase RLS policies
- [ ] Set up monitoring on `/api/health`

---

## License

MIT
