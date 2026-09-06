import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL

let redisClient: Redis | null = null
if (redisUrl) {
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    })
    redisClient.on('error', (err) => {
      console.warn('[Redis] Offline/Connection error, using in-memory store:', err.message)
    })
  } catch (e) {
    console.warn('[Redis] Init error, using in-memory store')
  }
}

// Resilient in-memory key-value store with TTL
const memoryStore = new Map<string, { value: string; expiresAt: number }>()

export const redis = {
  async get(key: string): Promise<string | null> {
    if (redisClient && redisClient.status === 'ready') {
      try {
        const val = await redisClient.get(key)
        if (val) return val
      } catch {}
    }
    const entry = memoryStore.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key)
      return null
    }
    return entry.value
  },

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    memoryStore.set(key, { value, expiresAt: Date.now() + seconds * 1000 })
    if (redisClient && redisClient.status === 'ready') {
      try {
        await redisClient.setex(key, seconds, value)
      } catch {}
    }
    return 'OK'
  },

  async del(key: string): Promise<number> {
    const deleted = memoryStore.delete(key) ? 1 : 0
    if (redisClient && redisClient.status === 'ready') {
      try {
        return await redisClient.del(key)
      } catch {}
    }
    return deleted
  },
}

export function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
