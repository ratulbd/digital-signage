# API Reference

## Contents
- [REST Endpoints](#rest-endpoints)
- [Socket.io Events](#socketio-events)
- [File Uploads](#file-uploads)

## REST Endpoints

All routes are prefixed with `/api`.

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login, returns JWT |
| POST | `/auth/verify` | Verify email with code |
| POST | `/auth/change-password` | Change password |
| GET | `/auth/me` | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | List users (scoped by role) |
| POST | `/users` | Create user |
| DELETE | `/users/:id` | Delete user |

### Devices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/devices` | List devices (scoped) |
| POST | `/devices/register` | Register new device |
| GET | `/devices/:id/schedule` | Get device schedule |
| POST | `/devices/:id/heartbeat` | Device heartbeat |
| POST | `/devices/:id/playback` | Report playback event |
| GET | `/devices/:id/status` | Get device status |

### Media
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/media` | List media (scoped) |
| POST | `/media/upload` | Upload file (multipart) |
| DELETE | `/media/:id` | Delete media |

### Schedules
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/schedules` | List schedules (scoped) |
| POST | `/schedules` | Create schedule |
| PUT | `/schedules/:id` | Update schedule |
| POST | `/schedules/:id/toggle` | Toggle active state |
| POST | `/schedules/:id/override` | Trigger emergency override |
| DELETE | `/schedules/:id` | Delete schedule |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/dashboard` | Dashboard statistics |
| GET | `/analytics/reports` | Report data |
| GET | `/analytics/device/:id` | Per-device analytics |

### Companies
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/companies` | List companies |
| POST | `/companies` | Create company |

### Circles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/circles` | List circles |
| POST | `/circles` | Create circle |

### Subcenters
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/subcenters` | List subcenters |
| POST | `/subcenters` | Create subcenter |

## Socket.io Events

### Device → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `register` | `{ deviceId }` | Register device connection |
| `heartbeat` | `{ deviceId }` | Periodic heartbeat |
| `playback_started` | `{ deviceId, mediaId, tier }` | Media started playing |
| `playback_ended` | `{ deviceId, mediaId, completed }` | Media finished / skipped |

### Server → Device
| Event | Payload | Description |
|-------|---------|-------------|
| `PLAY_OVERRIDE` | `{ mediaId, url, tier }` | Emergency override content |
| `RESUME_SCHEDULE` | — | Return to normal schedule |
| `SYNC_CONTENT` | — | Refresh content from server |

### Emitting from Backend
Import `ioInstance` from `services/socket.ts`:
```typescript
import { ioInstance } from './services/socket'
ioInstance.emit('PLAY_OVERRIDE', { mediaId, url, tier: 'TIER_1' })
```

## File Uploads

Files uploaded via `POST /api/media/upload` are stored in `backend/uploads/` and served statically. The dev proxy in `vite.config.ts` routes `/uploads` to the backend.
