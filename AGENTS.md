# Agent Guide: Cloud-Hosted Enterprise Digital Signage System

This document provides the ground truth about the project structure, technology stack, conventions, and development workflow. It is intended for AI coding agents who need to modify or extend the codebase.

---

## Project Overview

This is a full-stack MVP for a cloud-hosted enterprise digital signage system. It enables hierarchical content management across organizations, real-time push notifications to display devices, and playback analytics.

**Brand names used in the project:** "Desh-IT Dash", "Digital Dash", "Digital Signage Dashboard".

**System Architecture:**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web CMS       │     │   Backend API   │     │   TV Player     │
│   (React)       │◄────│   (Node.js)     │◄────│   (Vanilla JS)  │
│   Port: 3000    │     │   Port: 3001    │     │   Port: 3002    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   SQLite DB     │
                        │   (Prisma)      │
                        └─────────────────┘
```

The Web CMS proxies API requests, WebSocket connections, and file uploads to the backend during development.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Backend API | Node.js 18+, Express 4, TypeScript 5.7 |
| Database | PostgreSQL via Prisma ORM 5.22 |
| Real-Time | Socket.io 4.8 + Redis Adapter |
| Authentication | JWT (jsonwebtoken), bcryptjs |
| File Uploads | Multer 1.4 + S3/MinIO with signed URLs |
| Email | Nodemailer 8 (Gmail SMTP) |
| Monitoring | Prometheus + Grafana |
| Web CMS | React 19, Vite 8, TypeScript ~5.9, Tailwind CSS 4.2 |
| TV Player | Vanilla ES6 JavaScript, Socket.io client CDN |
| Package Manager | npm |

---

## Directory Structure

```
.
├── backend/                    # Node.js/TypeScript REST API
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── seed.ts             # Seed script for default users
│   ├── src/
│   │   ├── index.ts            # Server entry point
│   │   ├── routes/             # API route handlers
│   │   │   ├── auth.ts
│   │   │   ├── users.ts
│   │   │   ├── devices.ts
│   │   │   ├── media.ts
│   │   │   ├── schedules.ts
│   │   │   ├── analytics.ts
│   │   │   ├── subcenters.ts
│   │   │   ├── circles.ts
│   │   │   ├── companies.ts
│   │   │   ├── audit.ts        # Audit log retrieval
│   │   │   └── health.ts       # Health / readiness probes
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT verification + RBAC guards
│   │   │   ├── deviceAuth.ts   # Device token validation
│   │   │   ├── audit.ts        # Audit logging middleware
│   │   │   └── metrics.ts      # Prometheus HTTP instrumentation
│   │   ├── services/
│   │   │   ├── prisma.ts       # PrismaClient singleton
│   │   │   ├── socket.ts       # Socket.io event handlers
│   │   │   ├── mail.ts         # Gmail verification emails
│   │   │   ├── s3.ts           # S3/MinIO storage helpers
│   │   │   ├── audit.ts        # Audit log writer
│   │   │   └── metrics.ts      # Prometheus metric definitions
│   │   └── types/
│   │       └── index.ts        # Shared TS types and role/tier constants
│   ├── uploads/                # Persisted media files (fallback)
│   ├── dist/                   # Compiled JS output
│   ├── .env                    # Secrets (DATABASE_URL, JWT_SECRET, etc.)
│   ├── package.json
│   └── tsconfig.json
├── web-cms/                    # React admin dashboard
│   ├── src/
│   │   ├── main.tsx            # Entry point (StrictMode + ThemeProvider)
│   │   ├── App.tsx             # Router, protected routes, role guards
│   │   ├── pages/              # Top-level route components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DevicesPage.tsx
│   │   │   ├── MediaPage.tsx
│   │   │   ├── SchedulesPage.tsx
│   │   │   ├── AnalyticsPage.tsx
│   │   │   ├── UsersPage.tsx
│   │   │   ├── CompaniesPage.tsx
│   │   │   ├── CirclesPage.tsx
│   │   │   ├── SubcentersPage.tsx
│   │   │   └── LoginPage.tsx
│   │   ├── components/         # Shared UI components
│   │   │   ├── Layout.tsx
│   │   │   ├── Icon.tsx
│   │   │   └── UserProtocols.tsx
│   │   ├── context/
│   │   │   ├── AuthContext.tsx # Login state + localStorage token
│   │   │   └── ThemeContext.tsx # Hardcoded light theme (no toggle)
│   │   ├── services/
│   │   │   └── api.ts          # Axios instance with auth interceptor
│   │   ├── types/
│   │   │   └── index.ts        # Frontend type definitions
│   │   └── index.css           # Global styles + Tailwind theme vars
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts          # Dev server + proxy to backend
│   ├── eslint.config.js
│   ├── package.json
│   └── tsconfig.json
├── android-tv/                 # TV display player (Web-based PWA)
│   ├── public/
│   │   ├── index.html          # Single-page UI + inline styles
│   │   └── src/
│   │       └── app.js          # TVPlayer class (playback, cache, socket)
│   ├── src/
│   │   └── app.js              # Duplicate of public/src/app.js
│   └── package.json
├── android-tv-native/          # Native Android TV & Mobile App (Kotlin)
│   ├── app/src/main/java/com/deshit/dash/tv/
│   │   ├── MainActivity.kt     # Pairing screen with dynamic Server URL
│   │   ├── PlayerActivity.kt   # Playback UI with status bar & settings
│   │   ├── ApiClient.kt        # Dynamic API client
│   │   ├── SocketManager.kt    # Real-time event handling
│   │   └── ScheduleItem.kt     # Data models
│   └── app/src/main/res/layout/
│       ├── activity_main.xml   # Pairing UI
│       └── activity_player.xml # Playback UI with info overlays
├── monitoring/                 # Prometheus + Grafana configuration
│   ├── prometheus.yml          # Scrape config
│   └── grafana/
│       ├── dashboards/
│       │   └── dashboard.json  # Pre-built Digital Signage dashboard
│       └── provisioning/
│           ├── datasources/
│           │   └── datasource.yml
│           └── dashboards/
│               └── dashboard.yml
├── docs/                       # Empty documentation folder
├── docker-compose.yml          # Full stack orchestration
├── start-all.bat               # Start all 3 services in new cmd windows
├── stop-all.bat                # Kill all node/nodemon processes
├── README.md                   # Human-facing setup guide
├── DESIGN.md                   # Design system strategy document
├── PROJECT_ANALYSIS.md         # Architectural review and status report
└── BROWSER_TESTING_GUIDE.md    # Manual testing procedures
```

---

## Build and Development Commands

### Backend

```bash
cd backend
npm install
npm run dev          # nodemon src/index.ts  (port 3001)
npm run build        # tsc  (outputs to dist/)
npm start            # node dist/index.js

# Database
npx prisma migrate dev
npx prisma db seed
npx prisma studio
```

### Web CMS

```bash
cd web-cms
npm install
npm run dev          # vite  (port 3000, proxies /api to :3001)
npm run build        # tsc -b && vite build
npm run lint         # eslint
npm run preview      # vite preview
```

### TV Player

```bash
cd android-tv
npm install
npm run dev          # npx serve public  (port 3000 by default)
# Or explicitly:
npx serve public -p 3002
```

### Start All Services (Windows)

```bash
.\start-all.bat      # Opens 3 new cmd windows for backend, cms, tv
.\stop-all.bat       # taskkill /F /IM node.exe /IM nodemon.exe
```

### Docker (Recommended for Production Simulation)

```bash
# Start all services with PostgreSQL, Redis, backend, CMS, and TV
docker-compose up --build

# Run in detached mode
docker-compose up --build -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f backend
```

---

## Code Organization and Module Divisions

### Backend

- **`src/index.ts`** — Express app setup, middleware registration, route mounting, HTTP + Socket.io server start. Also registers `/health`, `/metrics`, and Prometheus middleware.
- **`src/routes/*.ts`** — Each file exports an Express `Router` as `xxxRouter`. Routes follow REST conventions under `/api/*`.
- **`src/routes/health.ts`** — `GET /health` (liveness) and `GET /health/ready` (readiness with DB/Redis/S3 checks).
- **`src/middleware/auth.ts`** — `authMiddleware` verifies JWT. Additional guards:
  - `requireCentralAdmin`
  - `requireCompanyAdmin`
  - `requireCircleAdmin`
  - `requireAnyAdmin`
- **`src/middleware/deviceAuth.ts`** — Validates `x-device-token` JWT for TV player requests.
- **`src/middleware/audit.ts`** — Wraps mutation routes to emit audit records.
- **`src/middleware/metrics.ts`** — Express middleware that instruments all HTTP requests with Prometheus histograms/counters.
- **`src/services/prisma.ts`** — Single PrismaClient export.
- **`src/services/socket.ts`** — Socket.io connection handlers: `register`, `heartbeat`, `playback_started`, `playback_ended`, `disconnect`. Exports `ioInstance` for emitting from routes.
- **`src/services/metrics.ts`** — Prometheus metric definitions (request duration, active devices, socket connections, media ops).
- **`src/services/s3.ts`** — S3/MinIO upload, delete, signed-URL, and existence helpers.
- **`src/types/index.ts`** — `AuthRequest`, `ROLES`, `TIERS`, `MEDIA_TYPES`, `rolePowerLevel()`.

### Web CMS

- **`src/App.tsx`** — `BrowserRouter`, `AuthProvider`, route definitions. `ProtectedRoute` checks auth; `RoleRoute` checks `ROLE_POWER` numeric level.
- **`src/services/api.ts`** — Axios instance with request interceptor injecting `Bearer` token from `localStorage`, and response interceptor redirecting to `/login` on 401.
- **`src/context/AuthContext.tsx`** — Manages `user`, `token`, `login`, `logout`. Decodes JWT payload client-side for initial state, then fetches `/auth/me` to refresh.
- **`src/types/index.ts`** — Mirrors backend entities plus `ROLE_POWER` and `ROLE_LABELS` maps.
- **Pages** are function components using hooks. They call `api.get/post/put/delete` directly.

### TV Player (Native App)

- **`MainActivity.kt`** — Entry point for pairing.
  - Allows manual input of **Server URL** to handle home/office IP changes.
  - Persists configuration in `SharedPreferences`.
- **`PlayerActivity.kt`** — Core playback engine.
  - Features a **Status Bar** (Device Name, Subcenter, Online Status) that auto-hides.
  - Includes a **Settings/Reset** button for re-pairing and clearing configuration.
  - Handles "Empty State" by displaying a message when no content is scheduled.
- **`ApiClient.kt`** — Handles REST calls using dynamic base URLs.
- **`SocketManager.kt`** — Manages real-time sync and overrides via WebSocket.

---

## Domain Model and Key Conventions

### Role Hierarchy (numeric power)

| Role | Power | Capabilities |
|------|-------|-------------|
| `CENTRAL_ADMIN` | 4 | Full system access |
| `COMPANY_ADMIN` | 3 | Manage company, circles, subcenters |
| `CIRCLE_ADMIN` | 2 | Manage circle and its subcenters |
| `SUBCENTER_ADMIN` | 1 | Manage local devices and Tier 3 content |

Backend middleware and frontend `RoleRoute` both use `rolePowerLevel()` for comparisons. A user with a higher power level can access routes requiring a lower level.

### Content Priority Tiers

| Tier | Scope | Description |
|------|-------|-------------|
| `TIER_1` | Company-wide | Emergency override / central broadcast |
| `TIER_2` | Circle-wide | Corporate scheduled content |
| `TIER_3` | Subcenter | Local content |

Resolution order in TV player: TIER_1 (override active) → TIER_2 → TIER_3 → local playlist.

### Organizational Hierarchy

```
Company → Circle → Subcenter → Device
```

Users, media, and schedules all carry `companyId`, `circleId`, and/or `subcenterId` for scoping. API routes filter results based on the authenticated user's place in this hierarchy.

### Default Seed Data

Running `npx prisma db seed` creates:

- Central Admin: `central@example.com` / `admin123`
- Subcenter Admin: `local@example.com` / `admin123`
- One subcenter: "Main Subcenter"
- One device: "Lobby TV 01"

---

## API and Socket.io Reference

### REST Endpoints

| Resource | Endpoints |
|----------|-----------|
| Auth | `POST /api/auth/login`, `POST /api/auth/verify`, `POST /api/auth/change-password`, `GET /api/auth/me` |
| Users | `GET /api/users`, `POST /api/users`, `DELETE /api/users/:id` |
| Devices | `GET /api/devices`, `POST /api/devices/register`, `GET /api/devices/:id/schedule`, `POST /api/devices/:id/heartbeat`, `POST /api/devices/:id/playback`, `GET /api/devices/:id/status` |
| Media | `GET /api/media`, `POST /api/media/upload`, `DELETE /api/media/:id` |
| Schedules | `GET /api/schedules`, `POST /api/schedules`, `PUT /api/schedules/:id`, `POST /api/schedules/:id/toggle`, `POST /api/schedules/:id/override`, `DELETE /api/schedules/:id` |
| Analytics | `GET /api/analytics/dashboard`, `GET /api/analytics/reports`, `GET /api/analytics/device/:id` |
| Companies | `GET /api/companies`, `POST /api/companies` |
| Circles | `GET /api/circles`, `POST /api/circles` |
| Subcenters | `GET /api/subcenters`, `POST /api/subcenters` |

### Socket.io Events

**Device → Server:**
- `register` — `{ deviceId }`
- `heartbeat` — `{ deviceId }`
- `playback_started` — `{ deviceId, mediaId, tier }`
- `playback_ended` — `{ deviceId, mediaId, completed }`

**Server → Device:**
- `PLAY_OVERRIDE` — `{ mediaId, url, tier }`
- `RESUME_SCHEDULE`
- `SYNC_CONTENT`

---

## Code Style Guidelines

### Backend

- Use single quotes for strings.
- Omit semicolons (project convention).
- 2-space indentation.
- Import order: built-ins → third-party → local modules.
- Route handlers use `try/catch` with `res.status(500).json({ error: err.message })` fallback.
- Catch clause variables are typed `err: any`.
- Prisma queries use `findMany`, `findUnique`, `create`, `update`, `delete`.
- Role/tier comparisons prefer `rolePowerLevel()` over string equality when checking hierarchy.

### Web CMS

- Use single quotes.
- Include semicolons.
- 2-space indentation.
- Functional components with explicit return types omitted (inferred).
- Use Tailwind utility classes for styling; custom classes in `index.css` use `expert-*` and `data-grid` naming.
- API calls go through the `api` axios instance, not raw `fetch`.
- Types are defined in `src/types/index.ts` and are manually synced with backend schema.

### TV Player

- Single ES6 class (`TVPlayer`).
- No build step; runs directly in browser.
- Uses `fetch` for HTTP, global `io()` for Socket.io (loaded from CDN in `index.html`).
- Cache API is used directly (`caches.open(CACHE_NAME)`), not via Service Worker.
- Constants: `IMAGE_DURATION_MS = 10000`, `HEARTBEAT_INTERVAL_MS = 60000`.

---

## Testing Instructions

**There are no automated tests in this project.** All testing is manual.

Refer to `BROWSER_TESTING_GUIDE.md` for the full manual test plan. Key verification steps:

1. Install dependencies in all three subprojects.
2. Run `npx prisma migrate dev` and `npx prisma db seed` in `backend/`.
3. Start all services with `start-all.bat`.
4. Verify:
   - CMS login at `http://localhost:3000` with seed credentials.
   - Backend API health via `GET /api/auth/me`.
   - TV player registration and playback at `http://localhost:3002`.
   - Emergency override propagates via Socket.io within <1s.
   - Offline caching works when backend is stopped.

---

## Security Considerations

### Current Protections
- Passwords hashed with bcrypt (cost factor 10).
- JWT tokens signed with `JWT_SECRET` from `.env` (7-day expiry).
- CORS enabled on backend.
- RBAC enforced in both middleware and route logic.
- Input validation on required fields in routes.

### Known Gaps (do not introduce new risks)
- **No rate limiting** on any endpoint.
- **No HTTPS enforcement** — development only.
- **CORS origin is `*`** for Socket.io.
- **Fallback JWT secret** exists in code (`'fallback-secret'`).
- **File uploads** are stored locally with no virus scanning or size limits beyond Multer defaults.
- **Mail service** has a hardcoded fallback Gmail address in `mail.ts`.

When making changes, do not rely on the fallback secrets for production logic, and do not widen CORS or disable auth checks without explicit user approval.

---

## Environment Variables

The backend expects a `.env` file in `backend/` with at minimum:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digital_signage?schema=public"
JWT_SECRET="your-secret-key"
PORT=3001
API_URL=http://localhost:3001
REDIS_URL=redis://localhost:6379
```

Optional:
```
MAIL_USER="..."
MAIL_PASS="..."
APP_NAME="Digital Signage"
S3_ENDPOINT="..."
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_BUCKET_NAME="digital-signage-media"
S3_FORCE_PATH_STYLE="true"
```

The Web CMS dev server proxies `/api`, `/socket.io`, and `/uploads` to `http://localhost:3001` via `vite.config.ts`.

---

## Important Files for Agents

| File | Purpose |
|------|---------|
| `backend/prisma/schema.prisma` | Source of truth for database schema |
| `backend/src/types/index.ts` | Backend role/tier constants and types |
| `web-cms/src/types/index.ts` | Frontend role/tier constants and types (must be kept in sync) |
| `web-cms/vite.config.ts` | Dev proxy configuration |
| `backend/src/services/socket.ts` | Real-time event wiring |
| `backend/src/services/metrics.ts` | Prometheus metric definitions |
| `android-tv/public/src/app.js` | TV playback logic |
| `monitoring/prometheus.yml` | Prometheus scrape configuration |
| `monitoring/grafana/dashboards/dashboard.json` | Pre-built Grafana dashboard |
| `BROWSER_TESTING_GUIDE.md` | Manual QA checklist |

---

## Deployment Notes

Docker Compose is the recommended deployment method. It orchestrates PostgreSQL, Redis, MinIO S3, the backend API, Web CMS, TV Player, Prometheus, and Grafana. Windows batch scripts (`start-all.bat`, `stop-all.bat`) remain for local non-Docker development but `stop-all.bat` force-kills **all** `node.exe` processes globally — it is not suitable for shared environments.

### Monitoring Stack

| Service | Port | URL |
|---------|------|-----|
| Grafana | 3003 | http://localhost:3003 |
| Prometheus | 9090 | http://localhost:9090 |
| Backend Metrics | 3001 | http://localhost:3001/metrics |
| Backend Health | 3001 | http://localhost:3001/health |

Grafana default credentials: `admin` / `admin`.

### Docker Services

```bash
docker-compose up --build -d
```

Production recommendations documented in `README.md` and `PROJECT_ANALYSIS.md` include: HTTPS termination, rate limiting, cloud S3 instead of MinIO, and Kubernetes for orchestration.

---

## Remote Production Deployment (Hostever / sbmoffice.net)

Whenever the user asks to **push**, **deploy**, or **publish** to `sbmoffice.net` or `hostserver`, use the automated deployment script located in `scripts/deploy.js`. **Do not ask the user for FTP credentials or deployment instructions.**

### Server & Connection Information

| Parameter | Value |
|-----------|-------|
| Domain | `sbmoffice.net` |
| FTP Host / IP | `172.96.172.133` (or `jasmine-us-wz1.hostever.us`) |
| FTP Port | `21` |
| FTP Username | `deployer_sbmoffice.net` (alternate: `deployer@sbmoffice.net`) |
| FTP Password | `Metal@#3579` |
| Web Server | LiteSpeed / cPanel (Hostever) |

### Remote Path & Subdomain Mappings

| Component | Remote Directory | Public Live URL | Deployment Trigger |
|-----------|------------------|-----------------|-------------------|
| **Web CMS** (React/Vite) | `/public_html/dash` | `https://dash.sbmoffice.net` | `npm run deploy:cms` |
| **TV Player** (PWA/Web) | `/public_html/tv` | `https://tv.sbmoffice.net` | `npm run deploy:tv` |
| **Backend API** (Node.js) | `/backend/dist` | `https://api.sbmoffice.net` | `npm run deploy:backend` |

### Deployment Commands

Run these commands from the project root (`d:\AI Project\Digital Dashboard`):

```bash
# 1. Deploy Web CMS only (builds React and syncs to /public_html/dash)
node scripts/deploy.js --cms
# or: npm run deploy:cms

# 2. Deploy TV Player only (syncs android-tv/public to /public_html/tv)
node scripts/deploy.js --tv
# or: npm run deploy:tv

# 3. Deploy Backend only (builds TypeScript and syncs dist to /backend/dist)
node scripts/deploy.js --backend
# or: npm run deploy:backend

# 4. Deploy All Components in one go
node scripts/deploy.js
# or: npm run deploy
# or: .\deploy.bat
```

### Git-First Deployment Workflow ("Ship")

The project includes an automated unified workflow script (`scripts/ship.js` or `ship.bat`) that handles both Git synchronization and Hostever deployment in a single step:

```bash
# 1-Command: Git Commit + Git Push + Deploy Web CMS
npm run ship -- "your commit message here"
# or simply: .\ship.bat "your commit message here"

# 1-Command: Git Commit + Git Push + Deploy All Components
npm run ship:all -- "deploy all components"
```

Under the hood, this script:
1. Automatically runs `git add .`
2. Creates a commit with your message (or an auto-generated timestamped message if omitted)
3. Pushes to remote `origin/main` (if a Git remote is configured)
4. Builds the production bundles and deploys directly to Hostever FTP (`sbmoffice.net`)


