import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config()

import { prisma } from './services/prisma'
import { authRouter } from './routes/auth'
import { userRouter } from './routes/users'
import { deviceRouter } from './routes/devices'
import { mediaRouter } from './routes/media'
import { scheduleRouter } from './routes/schedules'
import { analyticsRouter } from './routes/analytics'
import { subcenterRouter } from './routes/subcenters'
import { circleRouter } from './routes/circles'
import { companyRouter } from './routes/companies'
import { auditRouter } from './routes/audit'
import { healthRouter } from './routes/health'
import { setupSocketHandlers } from './services/socket'
import { isS3Enabled, setupS3Bucket } from './services/s3'
import { register, activeDevicesGauge } from './services/metrics'
import { metricsMiddleware } from './middleware/metrics'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

app.use(cors())
app.use(express.json())
app.use(metricsMiddleware)
if (!isS3Enabled) {
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')))
}

app.use('/api/auth', authRouter)
app.use('/api/users', userRouter)
app.use('/api/devices', deviceRouter)
app.use('/api/media', mediaRouter)
app.use('/api/schedules', scheduleRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/subcenters', subcenterRouter)
app.use('/api/circles', circleRouter)
app.use('/api/companies', companyRouter)
app.use('/api/audit-logs', auditRouter)
app.use('/health', healthRouter)
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})

setupSocketHandlers(io)

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`)
  // Setup S3 bucket (create + public read policy)
  if (isS3Enabled) {
    await setupS3Bucket()
  }
  // Reset all devices to offline on startup (stale state from previous session)
  try {
    await prisma.device.updateMany({ data: { isOnline: false, socketId: null } })
    console.log('Reset all devices to offline')
  } catch (err) {
    console.error('Failed to reset device online status:', err)
  }
})

// Periodically update active devices gauge
setInterval(async () => {
  try {
    const count = await prisma.device.count({ where: { isOnline: true } })
    activeDevicesGauge.set(count)
  } catch {
    // ignore
  }
}, 30000)

// Auto-mark devices offline if heartbeat is older than 2 minutes
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS)
    const result = await prisma.device.updateMany({
      where: {
        isOnline: true,
        lastHeartbeat: { lt: cutoff },
      },
      data: { isOnline: false, socketId: null },
    })
    if (result.count > 0) {
      console.log(`Auto-marked ${result.count} device(s) offline (heartbeat timeout)`)
    }
  } catch {
    // ignore
  }
}, 30000)
