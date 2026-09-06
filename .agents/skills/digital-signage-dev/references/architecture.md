# Architecture Reference

## Contents
- [System Diagram](#system-diagram)
- [Organizational Hierarchy](#organizational-hierarchy)
- [Role Hierarchy](#role-hierarchy)
- [Content Priority Tiers](#content-priority-tiers)
- [Key Module Responsibilities](#key-module-responsibilities)
- [Security Model](#security-model)

## System Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web CMS       │◄────│   Backend API   │◄────│   TV Player     │
│   (React)       │     │   (Node.js)     │     │   (Vanilla JS)  │
│   Port: 3000    │     │   Port: 3001    │     │   Port: 3002    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   SQLite DB     │
                        │   (Prisma)      │
                        └─────────────────┘
```

The Web CMS dev server proxies `/api`, `/socket.io`, and `/uploads` to `:3001` via `vite.config.ts`.

## Organizational Hierarchy

```
Company
  └── Circle
        └── Subcenter
              └── Device
```

Users, media, and schedules all carry `companyId`, `circleId`, and/or `subcenterId` for scoping. API routes filter results based on the authenticated user's place in this hierarchy.

## Role Hierarchy

| Role | Power | Capabilities |
|------|-------|-------------|
| `CENTRAL_ADMIN` | 4 | Full system access |
| `COMPANY_ADMIN` | 3 | Manage company, circles, subcenters |
| `CIRCLE_ADMIN` | 2 | Manage circle and its subcenters |
| `SUBCENTER_ADMIN` | 1 | Manage local devices and Tier 3 content |

Backend uses `rolePowerLevel()` from `types/index.ts`. Frontend uses `ROLE_POWER` map. Higher power level can access routes requiring lower level.

## Content Priority Tiers

| Tier | Scope | Description |
|------|-------|-------------|
| `TIER_1` | Company-wide | Emergency override / central broadcast |
| `TIER_2` | Circle-wide | Corporate scheduled content |
| `TIER_3` | Subcenter | Local content |

TV player resolution order: TIER_1 (if override active) → TIER_2 → TIER_3 → local playlist fallback.

## Key Module Responsibilities

### Backend (`backend/src/`)
- `index.ts` — Express app setup, middleware, route mounting, HTTP + Socket.io server start
- `routes/*.ts` — Each exports an Express `Router` as `xxxRouter`, mounted under `/api/*`
- `middleware/auth.ts` — `authMiddleware` verifies JWT; guards: `requireCentralAdmin`, `requireCompanyAdmin`, `requireCircleAdmin`, `requireAnyAdmin`
- `services/prisma.ts` — Single PrismaClient export
- `services/socket.ts` — Socket.io connection handlers; exports `ioInstance` for emitting from routes
- `services/mail.ts` — Gmail verification emails (has hardcoded fallback address)
- `types/index.ts` — `AuthRequest`, `ROLES`, `TIERS`, `MEDIA_TYPES`, `rolePowerLevel()`

### Web CMS (`web-cms/src/`)
- `App.tsx` — `BrowserRouter`, `AuthProvider`, routes, `ProtectedRoute`, `RoleRoute` (uses `ROLE_POWER`)
- `services/api.ts` — Axios instance with Bearer token interceptor and 401 redirect handler
- `context/AuthContext.tsx` — Manages `user`, `token`, `login`, `logout`
- `context/ThemeContext.tsx` — Hardcoded light theme, no toggle
- `types/index.ts` — Frontend types + `ROLE_POWER` / `ROLE_LABELS` maps

### TV Player (`android-tv/public/src/app.js`)
- Single `TVPlayer` ES6 class
- Device registration via URL params or manual input (stored in `localStorage`)
- Socket.io connection with auto-reconnect
- Schedule fetching from `/api/devices/:id/schedule`
- Tier-based playlist resolution
- Image (10s timer) and video playback with error recovery
- Cache API for offline media (`caches.open(CACHE_NAME)`)
- Heartbeat POST every 60s
- Playback analytics reporting
- Kiosk mode, fullscreen, wake lock

## Security Model

Current protections:
- Passwords hashed with bcrypt (cost factor 10)
- JWT tokens signed with `JWT_SECRET` from `.env` (7-day expiry)
- CORS enabled on backend
- RBAC enforced in middleware and route logic
- Input validation on required fields

Known gaps (do not widen):
- No rate limiting
- No HTTPS enforcement (dev only)
- CORS origin is `*` for Socket.io
- Fallback JWT secret exists in code (`'fallback-secret'`)
- File uploads stored locally with no virus scanning
- No API keys for device endpoints (heartbeat/schedule are public)
- Mail service has hardcoded fallback Gmail address
