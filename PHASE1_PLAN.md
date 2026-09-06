# Phase 1 Implementation Plan: Foundation & Infrastructure

**Objective:** Migrate the Digital Signage Dashboard from a single-process, SQLite-backed MVP to a containerized, multi-instance-ready foundation using PostgreSQL, Redis, and Docker.

**Scope:**
1. PostgreSQL database migration (Prisma).
2. Docker & Docker Compose setup for all services.
3. Socket.io Redis Adapter for horizontal scaling.

**Out of Scope:** S3, audit logs, device pairing, telemetry, testing, Helm.

---

## Prerequisites

- Docker Desktop (or Docker Engine + Compose) installed locally.
- Node.js 18+ and npm available (for Prisma CLI operations during transition).
- PostgreSQL client (`psql` or DBeaver) available for verification.

---

## Task 1: PostgreSQL Migration

### 1.1 Update Prisma Schema

**File:** `backend/prisma/schema.prisma`

**Changes:**
- Change `datasource db` provider from `sqlite` to `postgresql`.
- Review all `@default(uuid())` fields — Prisma handles UUIDs natively in PostgreSQL; no model changes required.
- Review all `String` fields used for JSON arrays (`Media.generatedImages`, `Media.keyPoints`) — they remain `String` for now (Prisma Json type migration is optional and can be deferred).
- All `@relation` and `onDelete: Cascade` behavior is compatible with PostgreSQL.

**Action:**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 1.2 Update Environment Variables

**File:** `backend/.env`

**Changes:**
- Replace `DATABASE_URL="file:./dev.db"` with a PostgreSQL connection string.
- Example: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digital_signage?schema=public"`
- Keep `JWT_SECRET`, `PORT`, `API_URL` as-is.

### 1.3 Install PostgreSQL Dependencies

**Command:**
```bash
cd backend
npm install @prisma/adapter-pg pg  # Optional: only if using Prisma Driver Adapters
# Prisma Client works with postgresql out of the box without extra deps.
```

> **Note:** Prisma 5.22 does not require a separate PostgreSQL driver package when using the standard query engine. Just ensure `prisma` and `@prisma/client` are already installed (they are).

### 1.4 Reset and Re-run Migrations

Because SQLite and PostgreSQL have incompatible migration histories, we must reset the migration baseline for PostgreSQL.

**Command:**
```bash
cd backend
# Ensure PostgreSQL is running locally (or via Docker from Task 2)
# Option A: Baseline an existing PostgreSQL DB (if it already has the schema)
# npx prisma migrate resolve --applied 20260506124022_add_generated_images

# Option B: For a fresh PostgreSQL DB (recommended for this migration):
npx prisma migrate dev --name init_postgres
```

**Rationale:** The existing migration files in `prisma/migrations/` were generated for SQLite. While Prisma can sometimes replay them on PostgreSQL, dialect-specific SQL (if any) may fail. The safest path is to squash migrations into a single fresh baseline for PostgreSQL.

**Preservation of Data:** Since this is an MVP with seed data, we will rely on `prisma db seed` to repopulate the database after migration. If production data exists, a separate ETL script would be needed — that is out of scope for Phase 1.

### 1.5 Update Seed Script (if needed)

**File:** `backend/prisma/seed.ts`

**Review:** Ensure the seed script uses Prisma Client queries (not raw SQLite SQL). It likely already does. Run it after migration:

```bash
npx prisma db seed
```

### 1.6 Verify Database Connectivity

**Command:**
```bash
npx prisma studio
```

Open Prisma Studio, confirm all models (`User`, `Device`, `Media`, `ScheduleItem`, `PlaybackLog`, etc.) are present and functional.

### 1.7 Update Backend Connection Logic

**File:** `backend/src/services/prisma.ts`

**Review:** The current Prisma client singleton should work without modification:
```typescript
import { PrismaClient } from '@prisma/client'
export const prisma = new PrismaClient()
```
No code changes needed here.

---

## Task 2: Docker & Docker Compose Setup

### 2.1 Create Backend Dockerfile

**File:** `backend/Dockerfile`

**Requirements:**
- Multi-stage build preferred, but single-stage is acceptable for MVP simplicity.
- Node 20 Alpine base image.
- Copy `package.json`, `package-lock.json`, install production deps, then copy source.
- Run `prisma generate` during build (so generated client is included).
- Expose port 3001.
- Start command: `node dist/index.js`.

**Notes:**
- `uploads/` directory should be a Docker volume if local storage is still used in Phase 1.
- Do NOT copy `node_modules` or `dist` from host; let the image build them.
- `.dockerignore` needed.

### 2.2 Create Web CMS Dockerfile

**File:** `web-cms/Dockerfile`

**Requirements:**
- Node 20 Alpine base image.
- Build the Vite app (`npm run build`) during image build.
- Serve via a lightweight static server (e.g., `serve`, `nginx:alpine`, or `vite preview`).
- **Recommended:** Use `nginx:alpine` to serve the `dist/` folder. This allows easy reverse-proxy rules for `/api`, `/socket.io`, and `/uploads` in production, decoupling the CMS from the dev Vite proxy.
- Expose port 80 (or 3000 for consistency).

**Nginx Configuration (if using nginx):**
- Serve static files from `/usr/share/nginx/html`.
- Proxy `/api`, `/socket.io`, and `/uploads` to the backend service (`http://backend:3001`).
- Support WebSocket upgrade for `/socket.io`.

### 2.3 Create TV Player Dockerfile (Optional but Recommended)

**File:** `android-tv/Dockerfile`

**Requirements:**
- `nginx:alpine` serving the `public/` directory.
- Expose port 80 (or 3002).
- The TV player is static HTML/JS; no build step required.

### 2.4 Create Docker Compose Configuration

**File:** `docker-compose.yml` (project root)

**Services:**
1. **`postgres`**
   - Image: `postgres:16-alpine`
   - Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
   - Ports: `5432:5432`
   - Volume: `postgres_data`

2. **`redis`**
   - Image: `redis:7-alpine`
   - Ports: `6379:6379`
   - Volume: `redis_data`

3. **`backend`**
   - Build context: `./backend`
   - Depends on: `postgres`, `redis`
   - Environment: `DATABASE_URL`, `JWT_SECRET`, `PORT=3001`, `REDIS_URL=redis://redis:6379`, `API_URL=http://localhost:3001`
   - Ports: `3001:3001`
   - Volume: `uploads` (bind mount or named volume for persistence)

4. **`web-cms`**
   - Build context: `./web-cms`
   - Depends on: `backend`
   - Ports: `3000:80` (or `3000:3000` if using Node static server)
   - Environment: `VITE_API_URL=http://localhost:3001` (if the app uses it; currently it proxies via Vite dev server, so production build needs to know the API origin).

5. **`android-tv`** (optional)
   - Build context: `./android-tv`
   - Ports: `3002:80`

6. **`nginx`** (optional reverse proxy)
   - If used, can unify ports under a single entrypoint (e.g., `localhost` with sub-paths or host-based routing).
   - For Phase 1 simplicity, direct port exposure is acceptable.

### 2.5 Create .dockerignore Files

**Files:**
- `backend/.dockerignore`
- `web-cms/.dockerignore`
- `android-tv/.dockerignore`

**Content:** Standard Node.js ignores (`node_modules`, `dist`, `.env`, `*.log`, `prisma/dev.db`, etc.).

### 2.6 Build and Verify

**Command:**
```bash
docker-compose up --build
```

**Verification Checklist:**
- [ ] `postgres` container starts and accepts connections.
- [ ] `backend` container builds successfully, runs `prisma generate` and `prisma migrate deploy` (or `dev`) on startup.
- [ ] Backend API responds at `http://localhost:3001/api/auth/me` (with seed user).
- [ ] `web-cms` container builds and serves the React app at `http://localhost:3000`.
- [ ] CMS login works with seed credentials.
- [ ] `android-tv` serves at `http://localhost:3002`.
- [ ] TV Player can register a device and fetch schedule.

**Backend Startup Script Consideration:**
Because the backend Docker image compiles TypeScript, the container should run migrations before starting the server. Create a startup script or modify the `CMD`:

```bash
npx prisma migrate deploy && node dist/index.js
```

> **Note:** `migrate deploy` is preferred over `migrate dev` in production/Docker because it is non-interactive.

---

## Task 3: Socket.io Redis Adapter

### 3.1 Install Dependencies

**Command:**
```bash
cd backend
npm install @socket.io/redis-adapter ioredis
```

### 3.2 Update Socket Service

**File:** `backend/src/services/socket.ts`

**Changes:**
- Import `createAdapter` from `@socket.io/redis-adapter`.
- Import `Redis` from `ioredis`.
- Accept `redisUrl` parameter or read from `process.env.REDIS_URL`.
- Create two Redis clients (`pubClient`, `subClient`).
- Attach the adapter to the Socket.io server inside `setupSocketHandlers`.
- Maintain backward compatibility: if `REDIS_URL` is not set, skip adapter initialization and run in single-instance mode (current behavior).

**Code Skeleton:**
```typescript
import { Server as SocketIOServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { prisma } from './prisma'

export let ioInstance: SocketIOServer | null = null

export function setupSocketHandlers(io: SocketIOServer) {
  ioInstance = io

  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    const pubClient = new Redis(redisUrl)
    const subClient = pubClient.duplicate()
    io.adapter(createAdapter(pubClient, subClient))
    console.log('Socket.io Redis adapter enabled')
  }

  // ... existing event handlers unchanged ...
}
```

### 3.3 Update Backend Server Initialization

**File:** `backend/src/index.ts`

**Changes:** None required. `setupSocketHandlers(io)` is already called after `Server` creation. The adapter attaches to the existing `io` instance.

### 3.4 Update docker-compose.yml

**Change:** Ensure `backend` service has `REDIS_URL=redis://redis:6379` in its environment variables and `depends_on` includes `redis`.

### 3.5 Verify Multi-Instance Propagation

**Test Procedure:**
1. Start the stack: `docker-compose up --build`.
2. Scale the backend to 2 instances: `docker-compose up --scale backend=2` (requires an `nginx` load balancer or `docker-compose` v3 `deploy.replicas` + an overlay network; for local testing, run a second backend container manually on a different host port).
3. Alternatively, run one backend in Docker and one locally (`npm run dev`), both pointing to the same `REDIS_URL`.
4. Open TV Player and register a device.
5. From the CMS, trigger an emergency override (`PLAY_OVERRIDE`).
6. **Expected Result:** The TV receives the event regardless of which backend instance the CMS connected to, because Redis pub/sub propagates the event across instances.

**Log Verification:**
- Check backend logs for `Socket.io Redis adapter enabled`.
- Confirm no `Error: Connection refused` to Redis.

---

## Task 4: Documentation & Configuration Updates

### 4.1 Update AGENTS.md

**File:** `AGENTS.md`

**Changes:**
- Update Technology Stack table: SQLite → PostgreSQL, add Redis.
- Update Environment Variables section: add `REDIS_URL`, update `DATABASE_URL` example.
- Add Docker section under Build and Development Commands.

### 4.2 Update Backend .env.example

**File:** `backend/.env.example` (create if missing)

**Content:**
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/digital_signage?schema=public"
JWT_SECRET="your-secret-key"
PORT=3001
API_URL=http://localhost:3001
REDIS_URL=redis://localhost:6379
```

### 4.3 Update Web CMS API Configuration for Production

**Current State:** The Web CMS uses Vite proxy (`vite.config.ts`) to forward `/api` to `localhost:3001` during development. In the Docker production build, there is no Vite dev server.

**Solution Options:**
- **Option A (Recommended):** Use Nginx in the `web-cms` container to proxy `/api`, `/socket.io`, and `/uploads` to the backend container. Zero code changes in the React app.
- **Option B:** Update `web-cms/src/services/api.ts` to use a configurable base URL (e.g., `import.meta.env.VITE_API_URL` or relative paths). If using relative paths (`/api`), the serving host must proxy them.

**Decision:** Use Option A (Nginx) to minimize code changes and risk.

**Nginx Config Snippet:**
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api {
    proxy_pass http://backend:3001;
    proxy_http_version 1.1;
  }

  location /socket.io {
    proxy_pass http://backend:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /uploads {
    proxy_pass http://backend:3001;
  }
}
```

---

## Task 5: Verification & Acceptance Criteria

### 5.1 Database Migration Verification

- [ ] `npx prisma migrate dev` completes without errors against PostgreSQL.
- [ ] `npx prisma db seed` creates the default central admin and subcenter admin users.
- [ ] All Prisma queries in the backend (findMany, findUnique, create, update, delete) execute successfully.
- [ ] Foreign key constraints behave correctly (e.g., deleting a `Company` cascades to related `Circle`s).

### 5.2 Docker Verification

- [ ] `docker-compose up --build` starts all services without errors.
- [ ] `docker-compose down` stops all services cleanly.
- [ ] `docker-compose up -d` runs services in detached mode.
- [ ] Data persists across container restarts (`postgres_data` volume retains data).

### 5.3 End-to-End Functional Verification

- [ ] Admin can log in via CMS (`http://localhost:3000`).
- [ ] Admin can upload media (file stored in `uploads` volume).
- [ ] Admin can create a schedule.
- [ ] TV Player (`http://localhost:3002`) registers device and fetches schedule.
- [ ] Media playback starts on the TV.
- [ ] Heartbeat logs are written to PostgreSQL (`DeviceHeartbeat` table).
- [ ] Emergency override from CMS reaches the TV within 1 second.

### 5.4 Multi-Instance Verification (Redis Adapter)

- [ ] Two backend instances share the same `REDIS_URL`.
- [ ] Device connects to Instance A.
- [ ] CMS connects to Instance B and sends `PLAY_OVERRIDE`.
- [ ] Device receives the override event.

---

## File Inventory (Expected Changes)

| File | Action |
|------|--------|
| `backend/prisma/schema.prisma` | Edit: change provider to `postgresql` |
| `backend/.env` | Edit: update `DATABASE_URL`, add `REDIS_URL` |
| `backend/.env.example` | Create |
| `backend/src/services/socket.ts` | Edit: add Redis adapter initialization |
| `backend/Dockerfile` | Create |
| `backend/.dockerignore` | Create |
| `web-cms/Dockerfile` | Create |
| `web-cms/.dockerignore` | Create |
| `web-cms/nginx.conf` | Create (if using nginx) |
| `android-tv/Dockerfile` | Create (optional) |
| `android-tv/.dockerignore` | Create (optional) |
| `docker-compose.yml` | Create (project root) |
| `AGENTS.md` | Edit: update stack and env docs |
| `backend/package.json` | Edit: add `@socket.io/redis-adapter`, `ioredis` |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SQLite migration SQL incompatibilities with PostgreSQL | Medium | High | Baseline fresh migrations; test all queries manually. |
| Prisma Client not generated in Docker image | Low | High | Run `prisma generate` in Dockerfile build step. |
| Redis adapter connection failure | Low | Medium | Make adapter optional (fallback to no adapter); log clearly. |
| Web CMS API proxy breaks in production container | Medium | High | Use Nginx reverse proxy inside CMS container; avoid hardcoding API URLs. |
| Uploads volume not persisted between container restarts | Low | Medium | Define named volume in `docker-compose.yml` for `backend/uploads`. |

---

## Estimated Effort

| Task | Estimated Time |
|------|---------------|
| PostgreSQL migration + seed verification | 2–3 hours |
| Dockerfiles + Docker Compose + Nginx config | 2–3 hours |
| Redis adapter integration | 1 hour |
| End-to-end verification & bug fixing | 2–3 hours |
| **Total** | **7–10 hours** |

---

## Next Steps After Phase 1

Upon successful completion of Phase 1, the system will be ready for:
- **Phase 2:** S3 media storage + CDN (since multi-instance backend now shares state via Redis, local `uploads/` is the next bottleneck).
- **Phase 3:** Security hardening (audit logs require PostgreSQL JSONB columns; device pairing requires Redis for TTL codes).
- **Phase 4:** Telemetry and predictive caching (Redis can also be used for caching schedules).

**Ready to proceed?** I can begin implementing these tasks immediately, starting with the PostgreSQL migration and Docker setup.
