# Android TV Player (Web-Based)

A standalone, browser-based digital signage player that simulates an Android TV experience. It connects to a Cloud-Hosted Enterprise Digital Signage backend via Socket.io and REST APIs, supports offline caching, and runs in kiosk mode.

## Project Structure

```
android-tv/
├── public/
│   ├── index.html      # Full-screen player page
│   └── src/
│       └── app.js      # Served copy of the core player logic
├── src/
│   └── app.js          # Source copy of the core player logic
├── package.json
└── README.md
```

## Quick Start

```bash
npm run dev
```

This serves the `public/` folder. Open the displayed URL (usually `http://localhost:3000`) in a browser.

## Device Registration

On first load, the app prompts for a **Device ID** and **Device Name**. These are stored in `localStorage`.

You can skip the prompt by passing URL parameters:

```
http://localhost:3000/?deviceId=tv-001&name=Lobby+Screen
```

## Backend Integration

- **Socket.io Server:** `ws://localhost:3001`
- **REST API Base:** `http://localhost:3001`
- **Media Files:** `http://localhost:3001/uploads/<filename>`

### Supported Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `register` | Out | Emits `{deviceId, deviceName}` on connect |
| `PLAY_OVERRIDE` | In | Immediately plays override media (Tier 1) |
| `RESUME_SCHEDULE` | In | Stops override and resumes scheduled playback |
| `SYNC_CONTENT` | In | Fetches latest schedule and restarts playback |

### REST Endpoints Used

- `GET /api/devices/{deviceId}/schedule` — preferred schedule endpoint
- `GET /api/schedules` — fallback schedule endpoint (filtered client-side)
- `POST /api/devices/{deviceId}/heartbeat` — sent every 60 seconds
- `POST /api/devices/{deviceId}/playback` — sent on media start/end

## Playback Priority

1. **Tier 1 — Override:** `PLAY_OVERRIDE` content plays exclusively
2. **Tier 2 — Scheduled:** Active scheduled content from the backend
3. **Tier 3 — Local:** Content stored in `localStorage` under `localPlaylist`
4. **Fallback:** "No Content" placeholder

## Offline Support

The player uses the **Cache API** to store downloaded media. When offline:
- It attempts to play cached media via object URLs
- If no cached content is available, it retries periodically

## Kiosk Mode Features

- Blocks `F5`, `Ctrl+R`, `Backspace`, `F11`, and `Escape`
- Prevents context menus and back-button navigation
- Requests fullscreen on click/touch
- Requests screen wake lock (if supported by the browser)

## Local Playlist (Tier 3)

You can populate a local fallback playlist by setting `localStorage.localPlaylist`:

```javascript
localStorage.setItem('localPlaylist', JSON.stringify([
  { id: 'local-1', url: 'http://localhost:3001/uploads/welcome.jpg', type: 'image', tier: 3 },
  { id: 'local-2', url: 'http://localhost:3001/uploads/promo.mp4', type: 'video', tier: 3 }
]));
```

## Notes

- Images display for **10 seconds** before advancing.
- Videos play until they end.
- The playlist loops continuously.
- Built with **vanilla JavaScript** — no build step or frameworks required.
