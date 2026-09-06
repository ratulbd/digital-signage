---
name: digital-signage-dev
description: Development guide for the "Digital Signage Dashboard" (Desh-IT Dash) full-stack MVP. Use when working with the backend API (Node.js/Express), Web CMS (React/Vite), or TV Player (vanilla JS) components. Covers project-specific architecture, database schema, API routes, Socket.io events, RBAC hierarchy, content tiers, code conventions, and development workflows.
---

# Digital Signage Dashboard — Developer Skill

## Quick Overview

3-tier digital signage system with hierarchical RBAC and tiered content priority:

| Component | Tech | Port | Path |
|-----------|------|------|------|
| Web CMS | React 19, Vite, Tailwind 4 | 3000 | `web-cms/` |
| Backend API | Node.js 18, Express, TS | 3001 | `backend/` |
| TV Player | Vanilla ES6, Socket.io | 3002 | `android-tv/` |
| Database | SQLite via Prisma | — | `backend/prisma/` |

**Hierarchy:** Company → Circle → Subcenter → Device
**Roles (power):** CENTRAL_ADMIN(4) > COMPANY_ADMIN(3) > CIRCLE_ADMIN(2) > SUBCENTER_ADMIN(1)
**Content Tiers (priority):** TIER_1 (override) > TIER_2 > TIER_3 > local fallback

## When to Read References

- **Architecture & data flow** → [references/architecture.md](references/architecture.md)
- **API endpoints & Socket.io events** → [references/api-reference.md](references/api-reference.md)
- **Database schema & relationships** → [references/database-schema.md](references/database-schema.md)
- **Code style conventions** → [references/conventions.md](references/conventions.md)
- **Development commands, testing, troubleshooting** → [references/development-workflow.md](references/development-workflow.md)

## Critical Files

| File | Purpose |
|------|---------|
| `backend/prisma/schema.prisma` | Database source of truth |
| `backend/src/types/index.ts` | Backend role/tier constants |
| `web-cms/src/types/index.ts` | Frontend types (must stay in sync) |
| `backend/src/services/socket.ts` | Socket.io event wiring |
| `backend/src/middleware/auth.ts` | JWT + RBAC guards |
| `android-tv/public/src/app.js` | TV playback logic |
| `web-cms/vite.config.ts` | Dev proxy to backend |

## Common Tasks

### Add a backend route
1. Create/edit file in `backend/src/routes/`
2. Export an Express `Router` as `xxxRouter`
3. Mount in `backend/src/index.ts`
4. Use `authMiddleware` + role guards from `middleware/auth.ts`
5. Type request as `AuthRequest` from `types/index.ts`
6. Use `prisma` singleton from `services/prisma.ts`
7. Wrap handlers in `try/catch` with `res.status(500).json({ error: err.message })`

### Add a frontend page
1. Create component in `web-cms/src/pages/`
2. Add route in `web-cms/src/App.tsx` inside `ProtectedRoute` / `RoleRoute`
3. Use `api` axios instance from `services/api.ts` (never raw `fetch`)
4. Add types to `web-cms/src/types/index.ts` if needed
5. Style with Tailwind utility classes

### Change database schema
1. Edit `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev` in `backend/`
3. Update `backend/src/types/index.ts` and `web-cms/src/types/index.ts`
4. Update affected routes and seed script if needed

See [references/development-workflow.md](references/development-workflow.md) for full database commands and reset procedures.

### Emit Socket.io event from backend
Import `ioInstance` from `services/socket.ts` and emit. See [references/api-reference.md](references/api-reference.md) for payload patterns.

### Test end-to-end
1. Run `start-all.bat` (opens 3 cmd windows)
2. Login at `http://localhost:3000` with seed credentials
3. Verify TV player at `http://localhost:3002`
4. Stop with `stop-all.bat`

See [references/development-workflow.md](references/development-workflow.md) for the full smoke test and troubleshooting guide.
