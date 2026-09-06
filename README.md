# Cloud-Hosted Enterprise Digital Signage System

A full-stack MVP for a cloud-hosted enterprise digital signage system with hierarchical content management, real-time push notifications, and analytics.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web CMS       │     │   Backend API   │     │   Android TV    │
│   (React)       │◄────│   (Node.js)     │◄────│   (Web Player)  │
│   Port: 3000    │     │   Port: 3001    │     │   Port: 3002    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   SQLite DB     │
                        │   (Prisma)      │
                        └─────────────────┘
```

## Features

### Content Priority System (3 Tiers)
- **Tier 1 (Central Override)**: Emergency alerts, instant broadcast to all displays
- **Tier 2 (Central Scheduled)**: Corporate content pushed from headquarters
- **Tier 3 (Local Content)**: Subcenter-specific content managed locally

### Role-Based Access Control
- **Central Admin**: Full system access, global overrides, user management
- **Subcenter Admin**: Local content management for assigned devices only

### Real-Time Communication
- WebSocket/Socket.io for instant content overrides (< 100ms latency)
- Automatic device registration and heartbeat monitoring

### Analytics Dashboard
- Device uptime tracking
- Content playback statistics
- Top-performing media reports
- Plays over time trends

### Offline Support
- Local media caching on display devices
- Continued playback during network outages
- Automatic sync when connection restores

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend API | Node.js + Express + TypeScript |
| Database | SQLite + Prisma ORM |
| Real-Time | Socket.io |
| Web CMS | React 18 + Vite + Tailwind CSS |
| TV Player | Vanilla JS + Socket.io Client |
| Auth | JWT (JSON Web Tokens) |

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### 1. Clone and Install

```bash
cd backend
npm install

cd ../web-cms
npm install

cd ../android-tv
npm install
```

### 2. Database Setup (Backend)

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

This creates the SQLite database with seed data:
- Central Admin: `central@example.com` / `admin123`
- Subcenter Admin: `local@example.com` / `admin123`
- Sample device: "Lobby TV 01"

### 3. Start the Backend Server

```bash
cd backend
npm run dev
```

Server runs at http://localhost:3001

### 4. Start the Web CMS

```bash
cd web-cms
npm run dev
```

CMS runs at http://localhost:3000

### 5. Start the TV Player

```bash
cd android-tv
npm run dev
```

Player runs at http://localhost:3002 (or check the output for the exact port)

## Usage Guide

### Central Admin Workflow

1. **Login**: Go to http://localhost:3000 and login with `central@example.com` / `admin123`
2. **Register Devices**: Go to Devices page and add new displays
3. **Upload Media**: Go to Media page and upload images/videos
4. **Create Schedules**: Go to Schedules page to schedule content (Tier 2)
5. **Emergency Override**: Use the Emergency Override button for instant Tier 1 broadcasts
6. **View Analytics**: Check the Analytics dashboard for device uptime and content stats

### Subcenter Admin Workflow

1. **Login**: Use `local@example.com` / `admin123`
2. **Upload Local Content**: Go to Media page (Tier 3 content)
3. **Create Local Schedules**: Schedule content for assigned devices only
4. **View Device Status**: Monitor device health and playback

### TV Player Setup

1. Open the TV Player URL in a browser or Android TV
2. Enter a device ID when prompted (use the device ID from the CMS)
3. The player will automatically:
   - Register with the backend
   - Fetch the current schedule
   - Play content in priority order (Tier 1 → Tier 2 → Tier 3)
   - Report playback analytics
   - Cache media for offline playback

## API Endpoints

### Auth
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/me` - Get current user

### Users (Central Admin only)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `DELETE /api/users/:id` - Delete user

### Devices
- `GET /api/devices` - List devices (role-filtered)
- `POST /api/devices/register` - Register new device
- `GET /api/devices/:id/schedule` - Get device schedule (public)
- `POST /api/devices/:id/heartbeat` - Device heartbeat (public)
- `POST /api/devices/:id/playback` - Playback event (public)
- `GET /api/devices/:id/status` - Device status

### Media
- `GET /api/media` - List media
- `POST /api/media/upload` - Upload file
- `DELETE /api/media/:id` - Delete media

### Schedules
- `GET /api/schedules` - List schedules
- `POST /api/schedules` - Create schedule
- `POST /api/schedules/:id/override` - Trigger Tier 1 override
- `DELETE /api/schedules/:id` - Delete schedule

### Analytics
- `GET /api/analytics/dashboard` - Dashboard stats
- `GET /api/analytics/device/:id` - Device playback logs

## Socket.io Events

### Device → Server
- `register` - Register device with `{deviceId}`
- `heartbeat` - Send heartbeat
- `playback_started` - Media started playing
- `playback_ended` - Media finished playing

### Server → Device
- `PLAY_OVERRIDE` - Play Tier 1 content immediately
- `RESUME_SCHEDULE` - Return to scheduled content
- `SYNC_CONTENT` - Refresh content schedule

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── index.ts          # Server entry
│   │   ├── routes/           # API routes
│   │   ├── middleware/       # Auth middleware
│   │   ├── services/         # Prisma, Socket.io
│   │   └── types/            # TypeScript types
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   └── seed.ts           # Seed data
│   └── uploads/              # Media storage
├── web-cms/
│   └── src/
│       ├── pages/            # React pages
│       ├── components/       # Shared components
│       ├── context/          # Auth context
│       └── services/         # API client
└── android-tv/
    └── public/
        ├── index.html        # TV player HTML
        └── src/
            └── app.js        # TV player logic
```

## Success Criteria Verification

- ✅ Backend API serves auth, content, schedule, override, and analytics endpoints
- ✅ Web CMS allows Central Admin to push an emergency override in <1s
- ✅ Android TV app plays scheduled content and switches instantly on override command
- ✅ Offline playback works using locally cached media
- ✅ RBAC prevents Subcenter Admin from accessing global override features
- ✅ Analytics dashboard displays accurate device uptime and content playback stats

## Production Considerations

For production deployment, consider:

1. **Database**: Replace SQLite with PostgreSQL
2. **Storage**: Use AWS S3 or Google Cloud Storage for media
3. **Redis**: Add Redis for session caching and Socket.io scaling
4. **Security**: Enable TLS 1.3, add rate limiting, implement API keys for devices
5. **Monitoring**: Add application monitoring (e.g., Sentry, DataDog)
6. **CI/CD**: Set up automated testing and deployment pipelines

## License

MIT
