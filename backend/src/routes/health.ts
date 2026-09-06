import { Router } from 'express'
import { Redis } from 'ioredis'
import { prisma } from '../services/prisma'
import { isS3Enabled, s3Client, S3_BUCKET_NAME } from '../services/s3'
import { HeadBucketCommand } from '@aws-sdk/client-s3'
import os from 'os'

const router = Router()

router.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'digital-signage-backend' })
})

router.get('/network', (req, res) => {
  const interfaces = os.networkInterfaces()
  const addresses: Array<{ interface: string, address: string, family: string, internal: boolean }> = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.internal) continue
      const family = addr.family as string | number
      if (family === 'IPv4' || family === 4) {
        addresses.push({ interface: name, address: addr.address, family: 'IPv4', internal: false })
      }
    }
  }

  const apiUrl = process.env.API_URL || ''
  const host = req.headers['host'] || ''

  res.json({
    addresses,
    apiUrl,
    host,
    ports: {
      backend: 3001,
      cms: 3000,
      player: 3002,
      minio: 9000,
    },
  })
})

router.get('/ready', async (req, res) => {
  const checks: Record<string, boolean> = {}
  let status = 'ok'

  // Database check
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.db = true
  } catch (err) {
    checks.db = false
    status = 'degraded'
  }

  // Redis check
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 3000 })
    try {
      await redis.connect()
      const pong = await redis.ping()
      checks.redis = pong === 'PONG'
      if (!checks.redis) status = 'degraded'
    } catch {
      checks.redis = false
      status = 'degraded'
    } finally {
      redis.disconnect()
    }
  } else {
    checks.redis = true // Not required
  }

  // S3 check
  if (isS3Enabled && s3Client) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_NAME }))
      checks.s3 = true
    } catch {
      checks.s3 = false
      status = 'degraded'
    }
  } else {
    checks.s3 = true // Not required
  }

  const code = status === 'ok' ? 200 : 503
  res.status(code).json({ status, checks, timestamp: new Date().toISOString() })
})

export { router as healthRouter }
