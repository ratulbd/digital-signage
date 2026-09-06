# Code Conventions

## Contents
- [Backend](#backend-backendsrc)
- [Web CMS](#web-cms-web-cmssrc)
- [TV Player](#tv-player-android-tvpublicsrcappjs)
- [Type Sync Checklist](#type-sync-checklist)

## Backend (`backend/src/`)

- Use **single quotes** for strings
- **Omit semicolons** (project convention)
- **2-space indentation**
- Import order: built-ins → third-party → local modules
- Route handlers use `try/catch` with fallback:
  ```typescript
  try {
    // ...
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
  ```
- Catch clause variables are typed `err: any`
- Prisma queries use `findMany`, `findUnique`, `create`, `update`, `delete`
- Role/tier comparisons prefer `rolePowerLevel()` over string equality
- Each route file exports an Express `Router` as `xxxRouter`
- Request type is `AuthRequest` from `types/index.ts`

### Example Route Handler
```typescript
import { Router } from 'express'
import { authMiddleware } from '../middleware/auth'
import { prisma } from '../services/prisma'
import { AuthRequest } from '../types'

export const exampleRouter = Router()

exampleRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const items = await prisma.example.findMany({
      where: { companyId: req.user?.companyId }
    })
    res.json(items)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
```

## Web CMS (`web-cms/src/`)

- Use **single quotes**
- **Include semicolons**
- **2-space indentation**
- Functional components with inferred return types (no explicit `: JSX.Element`)
- Use **Tailwind utility classes** for styling
- Custom classes in `index.css` use `expert-*` and `data-grid` naming
- API calls go through the `api` axios instance from `services/api.ts` (never raw `fetch`)
- Types are defined in `src/types/index.ts` and manually synced with backend schema
- Use `RoleRoute` in `App.tsx` for power-level based access control

### Example Page Component
```typescript
import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { SomeType } from '../types'

export default function SomePage() {
  const [items, setItems] = useState<SomeType[]>([])

  useEffect(() => {
    api.get('/some-endpoint').then((res) => setItems(res.data))
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Some Page</h1>
    </div>
  )
}
```

## TV Player (`android-tv/public/src/app.js`)

- Single ES6 class (`TVPlayer`)
- No build step; runs directly in browser
- Uses `fetch` for HTTP, global `io()` for Socket.io (loaded from CDN in `index.html`)
- Cache API is used directly (`caches.open(CACHE_NAME)`), not via Service Worker
- Constants:
  - `IMAGE_DURATION_MS = 10000`
  - `HEARTBEAT_INTERVAL_MS = 60000`

### Key Methods Pattern
```javascript
class TVPlayer {
  constructor() {
    this.deviceId = localStorage.getItem('deviceId')
    this.socket = null
    this.cache = null
  }

  async init() {
    this.cache = await caches.open('media-cache-v1')
    this.connectSocket()
    this.startHeartbeat()
  }

  // ...
}
```

## Type Sync Checklist

When modifying types, update BOTH files:
- `backend/src/types/index.ts`
- `web-cms/src/types/index.ts`

Keep these in sync:
- `ROLES` / `ROLE_POWER` values
- `TIERS` values
- `MEDIA_TYPES` values
- Entity interfaces (User, Device, MediaItem, Schedule, etc.)
