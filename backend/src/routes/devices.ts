import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../services/prisma'
import { authMiddleware, deviceAuthMiddleware } from '../middleware/auth'
import { AuthRequest, ROLES, TIERS } from '../types'
import { redis, generatePairingCode } from '../services/redis'
import { logAction } from '../services/audit'
import { isS3Enabled, getPublicFileUrl, fileExistsInS3, resolvePublicUrl } from '../services/s3'
import path from 'path'
import fs from 'fs'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'
const PAIRING_TTL_SECONDS = 300 // 5 minutes

// ── Pairing: Admin generates code for existing device ────────────────────────
router.post('/:id/pair-code', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { subcenterId: newSubcenterId } = req.body

    if (!redis) {
      return res.status(500).json({ error: 'Redis not available' })
    }

    const device = await prisma.device.findUnique({
      where: { id },
      include: { subcenter: true },
    })
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }

    // RBAC check
    if (
      req.user?.role === ROLES.SUBCENTER_ADMIN &&
      req.user.subcenterId !== device.subcenterId
    ) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Allow moving device to different subcenter during pairing
    if (newSubcenterId && newSubcenterId !== device.subcenterId) {
      if (req.user?.role === ROLES.SUBCENTER_ADMIN) {
        return res.status(403).json({ error: 'Forbidden: cannot move device to another subcenter' })
      }
      await prisma.device.update({
        where: { id },
        data: { subcenterId: newSubcenterId },
      })
    }

    const code = generatePairingCode()
    await redis.setex(
      `device_pair:${code}`,
      PAIRING_TTL_SECONDS,
      JSON.stringify({ deviceId: device.id })
    )

    await logAction({
      userId: req.user!.id,
      action: 'PAIR_DEVICE',
      target: `Device:${device.id}`,
      changes: { subcenterName: device.subcenter?.name || null },
      ipAddress: req.ip,
    })

    res.json({ code, deviceName: device.name, subcenter: device.subcenter?.name })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Pairing: TV confirms code ────────────────────────────────────────────────
router.post('/pair/confirm', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) {
      return res.status(400).json({ error: 'code required' })
    }

    if (!redis) {
      return res.status(500).json({ error: 'Redis not available' })
    }

    const pairData = await redis.get(`device_pair:${code}`)
    if (!pairData) {
      return res.status(404).json({ error: 'Invalid or expired pairing code' })
    }

    const { deviceId } = JSON.parse(pairData)
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { subcenter: true },
    })
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }

    const token = jwt.sign(
      { deviceId: device.id, name: device.name },
      JWT_SECRET,
      { expiresIn: '365d' }
    )

    // Invalidate pairing code after use
    await redis.del(`device_pair:${code}`)

    res.json({
      status: 'paired',
      deviceId: device.id,
      token,
      name: device.name,
      subcenterName: device.subcenter?.name || null,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Re-pairing: Admin requests repair code for existing device ───────────────
router.post('/:id/repair', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { subcenterId: newSubcenterId } = req.body

    if (!redis) {
      return res.status(500).json({ error: 'Redis not available' })
    }

    const device = await prisma.device.findUnique({
      where: { id },
      include: { subcenter: true },
    })
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }

    // RBAC: subcenter admin can only repair devices in their subcenter
    if (
      req.user?.role === ROLES.SUBCENTER_ADMIN &&
      req.user.subcenterId !== device.subcenterId
    ) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // If admin wants to move device to a different subcenter, update it now
    if (newSubcenterId && newSubcenterId !== device.subcenterId) {
      // Additional RBAC: subcenter admin cannot move devices to other subcenters
      if (req.user?.role === ROLES.SUBCENTER_ADMIN) {
        return res.status(403).json({ error: 'Forbidden: cannot move device to another subcenter' })
      }

      await prisma.device.update({
        where: { id },
        data: { subcenterId: newSubcenterId },
      })
    }

    const code = generatePairingCode()
    await redis.setex(
      `repair:${code}`,
      PAIRING_TTL_SECONDS,
      JSON.stringify({ deviceId: device.id })
    )

    await logAction({
      userId: req.user!.id,
      action: 'REPAIR_DEVICE',
      target: `Device:${device.id}`,
      changes: { subcenterName: device.subcenter?.name || null },
      ipAddress: req.ip,
    })

    res.json({ code, deviceName: device.name })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Re-pairing: TV confirms repair code ──────────────────────────────────────
router.post('/repair/confirm', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) {
      return res.status(400).json({ error: 'code required' })
    }

    if (!redis) {
      return res.status(500).json({ error: 'Redis not available' })
    }

    const repairData = await redis.get(`repair:${code}`)
    if (!repairData) {
      return res.status(404).json({ error: 'Invalid or expired repair code' })
    }

    const { deviceId } = JSON.parse(repairData)
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { subcenter: true },
    })
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }

    // Generate new token for existing device
    const token = jwt.sign(
      { deviceId: device.id, name: device.name },
      JWT_SECRET,
      { expiresIn: '365d' }
    )

    // Invalidate repair code
    await redis.del(`repair:${code}`)

    res.json({
      status: 'paired',
      deviceId: device.id,
      token,
      name: device.name,
      subcenterName: device.subcenter?.name || null,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── List devices ─────────────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === ROLES.CENTRAL_ADMIN) {
      const devices = await prisma.device.findMany({
        include: { subcenter: { include: { circle: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return res.json(devices)
    }

    if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      const devices = await prisma.device.findMany({
        where: {
          subcenter: {
            circle: { companyId: req.user.companyId },
          },
        },
        include: { subcenter: { include: { circle: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return res.json(devices)
    }

    if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId) {
      const devices = await prisma.device.findMany({
        where: {
          subcenter: { circleId: req.user.circleId },
        },
        include: { subcenter: { include: { circle: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return res.json(devices)
    }

    if (req.user?.role === ROLES.SUBCENTER_ADMIN && req.user.subcenterId) {
      const devices = await prisma.device.findMany({
        where: { subcenterId: req.user.subcenterId },
        include: { subcenter: { include: { circle: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return res.json(devices)
    }

    return res.status(403).json({ error: 'Forbidden' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Delete device & POST /:id/delete ─────────────────────────────────────────
const handleDeviceDelete = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const device = await prisma.device.findUnique({
      where: { id },
      include: { subcenter: true },
    })
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }

    if (
      req.user?.role === ROLES.SUBCENTER_ADMIN &&
      req.user.subcenterId !== device.subcenterId
    ) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Check for dependent schedules
    const scheduleCount = await prisma.scheduleItem.count({
      where: { deviceIds: { some: { id } } },
    })
    if (scheduleCount > 0) {
      return res.status(409).json({
        error: `Cannot delete device — it has ${scheduleCount} active schedule(s). Remove from schedules first.`,
      })
    }

    await logAction({
      userId: req.user!.id,
      action: 'DELETE_DEVICE',
      target: `Device:${id}`,
      changes: { subcenterName: device.subcenter?.name || null },
      ipAddress: req.ip,
    })

    await prisma.device.delete({ where: { id } })
    res.json({ message: 'Device deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/:id', authMiddleware, handleDeviceDelete)
router.post('/:id/delete', authMiddleware, handleDeviceDelete)

// ── Register device (legacy, admin-only) ─────────────────────────────────────
router.post('/register', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, subcenterId } = req.body
    if (!name || !subcenterId) {
      return res.status(400).json({ error: 'Name and subcenterId required' })
    }

    if (
      req.user?.role === ROLES.SUBCENTER_ADMIN &&
      req.user.subcenterId !== subcenterId
    ) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const device = await prisma.device.create({
      data: {
        name,
        subcenterId,
        isOnline: false,
      },
      include: { subcenter: true },
    })

    await logAction({
      userId: req.user!.id,
      action: 'CREATE_DEVICE',
      target: `Device:${device.id}`,
      changes: { subcenterName: device.subcenter?.name || null },
      ipAddress: req.ip,
    })

    res.status(201).json(device)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get device info (protected by device JWT) ────────────────────────────────
router.get('/:id/info', deviceAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    if (req.device?.deviceId !== id) {
      return res.status(403).json({ error: 'Device token mismatch' })
    }
    const device = await prisma.device.findUnique({
      where: { id },
      include: { subcenter: true },
    })
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }
    res.json({
      id: device.id,
      name: device.name,
      subcenterName: device.subcenter?.name || null,
      subcenterId: device.subcenterId,
      pairedAt: device.pairedAt,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Get schedule (protected by device JWT) ───────────────────────────────────
router.get('/:id/schedule', deviceAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    // Verify the device token matches the requested device
    if (req.device?.deviceId !== id) {
      return res.status(403).json({ error: 'Device token mismatch' })
    }

    // Return all active schedules for this device.
    // Time/date filtering is handled by the TV player in the device's local timezone.
    const schedules = await prisma.scheduleItem.findMany({
      where: {
        deviceIds: { some: { id } },
        isActive: true,
      },
      include: {
        media: {
          include: {
            category: { select: { name: true } },
            contentType: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Filter out schedules where the media file doesn't exist
    const validSchedules = await Promise.all(
      schedules.map(async (schedule) => {
        if (!schedule.media) return null
        if (schedule.media.type === 'TEXT') return schedule
        if (isS3Enabled) {
          const exists = await fileExistsInS3(schedule.media.url.replace(/^\//, ''))
          return exists ? schedule : null
        } else {
          const filePath = path.join(__dirname, '../../uploads', schedule.media.filename)
          return fs.existsSync(filePath) ? schedule : null
        }
      })
    )

    const baseUrl = process.env.API_URL || 'http://localhost:3001'

    const getDeviceUrl = (media: any) => {
      if (!media?.url) return null
      // Use TV-optimized version for videos if available
      const isVideo = media.type === 'VIDEO'
      const hasTv = isVideo && media.tvUrl
      const mediaUrl = hasTv ? media.tvUrl : media.url
      if (isS3Enabled) {
        return getPublicFileUrl(mediaUrl.replace(/^\//, ''), req)
      }
      return `${resolvePublicUrl(baseUrl, req)}${mediaUrl}`
    }

    const mappedSchedules = await Promise.all(
      validSchedules
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .map(async (schedule) => ({
          id: schedule.id,
          mediaId: schedule.mediaId,
          tier: schedule.tier,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          isRecurring: schedule.isRecurring,
          url: getDeviceUrl(schedule.media),
          filename: schedule.media?.filename,
          type: schedule.media?.type?.toLowerCase() || 'image',
          size: schedule.media?.size,
          contentName: schedule.media?.contentName || null,
          categoryName: schedule.media?.category?.name || null,
          contentTypeName: schedule.media?.contentType?.name || null,
        }))
    )

    const tierOrder: Record<string, number> = { [TIERS.TIER_1]: 1, [TIERS.TIER_2]: 2, [TIERS.TIER_3]: 3 }
    mappedSchedules.sort((a, b) => (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3))

    res.json(mappedSchedules)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Heartbeat (protected by device JWT) ──────────────────────────────────────
router.post('/:id/heartbeat', deviceAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    if (req.device?.deviceId !== id) {
      return res.status(403).json({ error: 'Device token mismatch' })
    }

    const now = new Date()

    const device = await prisma.device.update({
      where: { id },
      data: {
        lastHeartbeat: now,
        isOnline: true,
      },
    })

    await prisma.deviceHeartbeat.create({
      data: {
        deviceId: id,
        timestamp: now,
        isOnline: true,
      },
    })

    res.json(device)
  } catch (err: any) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Device not found' })
    }
    res.status(500).json({ error: err.message })
  }
})

// ── Playback (protected by device JWT) ───────────────────────────────────────
router.post('/:id/playback', deviceAuthMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    if (req.device?.deviceId !== id) {
      return res.status(403).json({ error: 'Device token mismatch' })
    }

    const { mediaId, tier, event, completed } = req.body

    if (!mediaId || !event) {
      return res.status(400).json({ error: 'mediaId and event required' })
    }

    if (event === 'started') {
      await prisma.playbackLog.create({
        data: {
          deviceId: id,
          mediaId,
          tier: tier || TIERS.TIER_3,
          startedAt: new Date(),
          completed: false,
        },
      })
    } else if (event === 'ended') {
      const log = await prisma.playbackLog.findFirst({
        where: { deviceId: id, mediaId },
        orderBy: { startedAt: 'desc' },
      })
      if (log) {
        await prisma.playbackLog.update({
          where: { id: log.id },
          data: { endedAt: new Date(), completed: completed ?? true },
        })
      }
    }

    res.json({ message: 'Playback event recorded' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── Device status (admin only) ───────────────────────────────────────────────
router.get('/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const device = await prisma.device.findUnique({
      where: { id },
      include: { subcenter: true },
    })

    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }

    if (
      req.user?.role === ROLES.SUBCENTER_ADMIN &&
      device.subcenterId !== req.user.subcenterId
    ) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    res.json(device)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export { router as deviceRouter }
