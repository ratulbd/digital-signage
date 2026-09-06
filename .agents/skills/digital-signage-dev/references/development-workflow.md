# Development Workflow Reference

## Contents
- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Running Services](#running-services)
- [Build Commands](#build-commands)
- [Database Commands](#database-commands)
- [Linting](#linting)
- [Default Seed Credentials](#default-seed-credentials)
- [Service URLs](#service-urls)
- [Testing Procedures](#testing-procedures)
- [Troubleshooting](#troubleshooting)
- [Environment Variables](#environment-variables)
- [Important Notes](#important-notes)

## Prerequisites

- Node.js 18+
- npm
- Windows (batch scripts used for orchestration)

## Initial Setup

```bash
# 1. Install backend dependencies and setup database
cd backend
npm install
npx prisma migrate dev
npx prisma db seed

# 2. Install Web CMS dependencies
cd ../web-cms
npm install

# 3. Install TV Player dependencies
cd ../android-tv
npm install
```

## Running Services

### Option 1: All at once (Windows)
```bash
# From project root
.\start-all.bat    # Opens 3 new cmd windows
.\stop-all.bat     # Kills all node.exe / nodemon.exe processes
```

### Option 2: Individual services
```bash
# Backend (port 3001)
cd backend
npm run dev        # nodemon src/index.ts

# Web CMS (port 3000)
cd web-cms
npm run dev        # vite dev server

# TV Player (port 3002)
cd android-tv
npx serve public -p 3002
```

## Build Commands

```bash
# Backend
cd backend
npm run build      # tsc → dist/
npm start          # node dist/index.js

# Web CMS
cd web-cms
npm run build      # tsc -b && vite build
npm run preview    # vite preview
```

## Database Commands

```bash
cd backend

npx prisma migrate dev      # Create/apply migrations
npx prisma db seed          # Run seed script
npx prisma studio           # Open Prisma Studio GUI
npx prisma generate         # Regenerate Prisma Client
npx prisma migrate reset    # Reset DB and re-run migrations
```

## Linting

```bash
cd web-cms
npm run lint       # eslint
```

## Default Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| Central Admin | `central@example.com` | `admin123` |
| Subcenter Admin | `local@example.com` | `admin123` |

## Service URLs

| Service | URL | Notes |
|---------|-----|-------|
| Web CMS | http://localhost:3000 | React admin interface |
| Backend API | http://localhost:3001 | REST + Socket.io |
| TV Player | http://localhost:3002 | Display player |

## Testing Procedures

All testing is manual. There are no automated tests in this project.

### Quick Smoke Test

1. Start all services with `start-all.bat`
2. Open `http://localhost:3000` and login as `central@example.com` / `admin123`
3. Verify Dashboard loads with sidebar navigation
4. Open `http://localhost:3002` and register device "Lobby TV 01"
5. Upload media in CMS, create schedule, verify TV plays it
6. Trigger Emergency Override from Schedules page, verify TV switches within 1s

### Full Test Plan

See `BROWSER_TESTING_GUIDE.md` in project root for the complete manual QA checklist covering:
- Web CMS login, navigation, CRUD operations
- Device registration and management
- Media upload and playback
- Schedule creation and tier testing
- Emergency override propagation
- TV player offline caching
- Heartbeat monitoring
- Role-based access control
- API endpoint verification
- Performance benchmarks

## Troubleshooting

### Web CMS shows blank page
1. Check Vite dev server is running
2. Open browser dev tools for errors
3. Verify React bundle loaded

### TV player stuck on registration
1. Check backend is running on port 3001
2. Verify device ID exists in database
3. Check browser console for network errors

### Media not playing on TV
1. Verify media file uploaded successfully (check `backend/uploads/`)
2. Check schedule is active (start/end dates/times)
3. Verify device is assigned to schedule
4. Check TV player console for playback errors

### Real-time overrides not working
1. Verify Socket.io connection established (check browser Network → WS tab)
2. Check TV player registered with correct device ID
3. Verify backend socket handlers running
4. Check network connectivity between services

### Database issues after schema change
1. Run `npx prisma migrate dev` in `backend/`
2. If migration fails: `npx prisma migrate reset` (WARNING: data loss)
3. Re-seed: `npx prisma db seed`
4. Restart backend dev server

### Port conflicts
- Backend: `PORT` in `backend/.env` (default 3001)
- CMS: configured in `web-cms/vite.config.ts` (default 3000)
- TV: pass `-p <port>` to `npx serve` (default 3002)

## Environment Variables

Backend `.env` (in `backend/.env`):
```
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-secret-key"
PORT=3001
API_URL=http://localhost:3001
```

Optional:
```
MAIL_USER="..."
MAIL_PASS="..."
APP_NAME="Digital Signage"
```

## Important Notes

- `stop-all.bat` force-kills **all** `node.exe` processes globally — not suitable for shared environments
- No Docker, CI/CD, or production deployment pipeline is configured
- `vite.config.ts` proxies `/api`, `/socket.io`, and `/uploads` to `:3001`
- TV player stores device registration in `localStorage`
- Cache API is used directly without Service Worker
