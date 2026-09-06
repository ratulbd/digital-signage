import { Server as SocketIOServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { Redis } from 'ioredis'
import { prisma } from './prisma'
import { socketConnectionsGauge, activeDevicesGauge } from './metrics'

export let ioInstance: SocketIOServer | null = null

export function setupSocketHandlers(io: SocketIOServer) {
  ioInstance = io

  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    const pubClient = new Redis(redisUrl)
    const subClient = pubClient.duplicate()
    io.adapter(createAdapter(pubClient, subClient))
    console.log('Socket.io Redis adapter enabled')
  }

  io.on('connection', (socket) => {
    socketConnectionsGauge.inc()
    console.log('Socket connected:', socket.id)

    socket.on('register', async ({ deviceId }: { deviceId: string }) => {
      try {
        const device = await prisma.device.findUnique({ where: { id: deviceId } })
        if (!device) {
          console.warn(`Socket register: device ${deviceId} not found`)
          return
        }
        await prisma.device.update({
          where: { id: deviceId },
          data: {
            socketId: socket.id,
            isOnline: true,
            lastHeartbeat: new Date(),
          },
        })
        socket.join(`device:${deviceId}`)
        console.log(`Device ${deviceId} registered to room device:${deviceId}`)
        const count = await prisma.device.count({ where: { isOnline: true } })
        activeDevicesGauge.set(count)
      } catch (err) {
        console.error('Register error:', err)
      }
    })

    socket.on('heartbeat', async ({ deviceId }: { deviceId: string }) => {
      try {
        const device = await prisma.device.findUnique({ where: { id: deviceId } })
        if (!device) return
        const now = new Date()
        await prisma.device.update({
          where: { id: deviceId },
          data: {
            lastHeartbeat: now,
            isOnline: true,
          },
        })
        await prisma.deviceHeartbeat.create({
          data: {
            deviceId,
            timestamp: now,
            isOnline: true,
          },
        })
      } catch (err) {
        console.error('Heartbeat error:', err)
      }
    })

    socket.on(
      'playback_started',
      async ({
        deviceId,
        mediaId,
        tier,
      }: {
        deviceId: string
        mediaId: string
        tier: string
      }) => {
        try {
          await prisma.playbackLog.create({
            data: {
              deviceId,
              mediaId,
              tier,
              startedAt: new Date(),
              completed: false,
            },
          })
        } catch (err) {
          console.error('Playback started error:', err)
        }
      }
    )

    socket.on(
      'playback_ended',
      async ({
        deviceId,
        mediaId,
        completed,
      }: {
        deviceId: string
        mediaId: string
        completed: boolean
      }) => {
        try {
          const log = await prisma.playbackLog.findFirst({
            where: { deviceId, mediaId },
            orderBy: { startedAt: 'desc' },
          })

          if (log) {
            await prisma.playbackLog.update({
              where: { id: log.id },
              data: {
                endedAt: new Date(),
                completed,
              },
            })
          }
        } catch (err) {
          console.error('Playback ended error:', err)
        }
      }
    )

    socket.on('disconnect', async () => {
      try {
        const device = await prisma.device.findFirst({
          where: { socketId: socket.id },
        })

        if (device) {
          await prisma.device.update({
            where: { id: device.id },
            data: { isOnline: false },
          })
        }
        const count = await prisma.device.count({ where: { isOnline: true } })
        activeDevicesGauge.set(count)
        console.log('Socket disconnected:', socket.id)
      } catch (err) {
        console.error('Disconnect error:', err)
      }
      socketConnectionsGauge.dec()
    })
  })
}
