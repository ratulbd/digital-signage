import { Router } from 'express'
import { prisma } from '../services/prisma'
import { authMiddleware } from '../middleware/auth'
import { AuthRequest, ROLES, TIERS, rolePowerLevel } from '../types'
import { ioInstance } from '../services/socket'
import { logAction } from '../services/audit'
import { resolvePublicUrl } from '../services/s3'

const router = Router()

// Helper: minimum tier a role can create
function minTierForRole(role: string): string {
  switch (role) {
    case ROLES.CENTRAL_ADMIN:  return TIERS.TIER_1
    case ROLES.COMPANY_ADMIN:  return TIERS.TIER_1
    case ROLES.CIRCLE_ADMIN:   return TIERS.TIER_2
    default:                   return TIERS.TIER_3
  }
}

// Helper: tiers that a role can override (i.e., tiers strictly below theirs)
function overridableTiers(role: string): string[] {
  switch (role) {
    case ROLES.CENTRAL_ADMIN: return [TIERS.TIER_1, TIERS.TIER_2, TIERS.TIER_3]
    case ROLES.COMPANY_ADMIN: return [TIERS.TIER_2, TIERS.TIER_3]
    case ROLES.CIRCLE_ADMIN:  return [TIERS.TIER_3]
    default:                  return []
  }
}

// GET /api/schedules — scoped
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    let where: any = {}

    if (req.user?.role === ROLES.CENTRAL_ADMIN) {
      // sees everything
    } else if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      where = { companyId: req.user.companyId }
    } else if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId) {
      where = {
        OR: [
          { circleId: req.user.circleId },
          // Also see company-level schedules (TIER_1) affecting their circle
          { tier: TIERS.TIER_1, companyId: req.user.companyId || undefined },
        ],
      }
    } else if (req.user?.role === ROLES.SUBCENTER_ADMIN) {
      // Resolve their subcenter
      const subcenterId = req.user.subcenterId
      const userFull = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { subcenter: { include: { circle: true } } },
      })
      const circleId = req.user.circleId || userFull?.subcenter?.circleId
      const companyId = req.user.companyId || userFull?.subcenter?.circle?.companyId

      where = {
        OR: [
          // Their own TIER_3 schedules
          { createdBy: req.user.id, tier: TIERS.TIER_3 },
          // TIER_2 from their circle
          { tier: TIERS.TIER_2, circleId: circleId || undefined },
          // TIER_1 from their company
          { tier: TIERS.TIER_1, companyId: companyId || undefined },
        ],
      }
    } else {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const schedules = await prisma.scheduleItem.findMany({
      where,
      include: {
        media: {
          include: {
            category: { select: { name: true } },
            contentType: { select: { name: true } },
          },
        },
        deviceIds: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const mapped = schedules
      .filter((s: any) => s.media)
      .map((s) => ({
        ...s,
        devices: s.deviceIds,
        deviceIds: s.deviceIds?.map((d: any) => d.id) || [],
      }))

    res.json(mapped)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/schedules — create schedule
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mediaId, tier, deviceIds, startDate, endDate, startTime, endTime, isRecurring } = req.body

    if (!mediaId || !tier || !deviceIds || !Array.isArray(deviceIds)) {
      return res.status(400).json({ error: 'mediaId, tier, and deviceIds[] required' })
    }

    if (isRecurring && (!startTime || !endTime)) {
      return res.status(400).json({ error: 'Recurring schedules require startTime and endTime' })
    }

    const role = req.user!.role
    const allowedTiers =
      role === ROLES.CENTRAL_ADMIN ? [TIERS.TIER_1, TIERS.TIER_2, TIERS.TIER_3] :
      role === ROLES.COMPANY_ADMIN  ? [TIERS.TIER_1, TIERS.TIER_2, TIERS.TIER_3] :
      role === ROLES.CIRCLE_ADMIN   ? [TIERS.TIER_2, TIERS.TIER_3] :
                                      [TIERS.TIER_3]

    if (!allowedTiers.includes(tier)) {
      return res.status(403).json({ error: `Your role can only create: ${allowedTiers.join(', ')}` })
    }

    // SUBCENTER_ADMIN — must own all devices
    if (role === ROLES.SUBCENTER_ADMIN) {
      const devices = await prisma.device.findMany({ where: { id: { in: deviceIds } } })
      const unauthorized = devices.some((d) => d.subcenterId !== req.user!.subcenterId)
      if (unauthorized) {
        return res.status(403).json({ error: 'Can only schedule for devices in your subcenter' })
      }
    }

    // CIRCLE_ADMIN — devices must be in their circle's subcenters
    if (role === ROLES.CIRCLE_ADMIN) {
      const devices = await prisma.device.findMany({
        where: { id: { in: deviceIds } },
        include: { subcenter: true },
      })
      const unauthorized = devices.some((d) => d.subcenter.circleId !== req.user!.circleId)
      if (unauthorized) {
        return res.status(403).json({ error: 'Can only schedule for devices in your circle' })
      }
    }

    // COMPANY_ADMIN — devices must be in their company's circles
    if (role === ROLES.COMPANY_ADMIN) {
      const devices = await prisma.device.findMany({
        where: { id: { in: deviceIds } },
        include: { subcenter: { include: { circle: true } } },
      })
      const unauthorized = devices.some((d) => !d.subcenter.circle || d.subcenter.circle.companyId !== req.user!.companyId)
      if (unauthorized) {
        return res.status(403).json({ error: 'Can only schedule for devices in your company' })
      }
    }

    // Conflict check: are there higher-tier active schedules for the same devices?
    const higherTiers = tier === TIERS.TIER_3
      ? [TIERS.TIER_1, TIERS.TIER_2]
      : tier === TIERS.TIER_2
      ? [TIERS.TIER_1]
      : []

    if (higherTiers.length > 0) {
      const conflicts = await prisma.scheduleItem.findMany({
        where: {
          tier: { in: higherTiers },
          isActive: true,
          deviceIds: { some: { id: { in: deviceIds } } },
        },
        include: { media: true },
      })

      const timeConflicts = conflicts.filter((s) => {
        if (s.startTime && s.endTime && startTime && endTime) {
          if (s.endTime < startTime || s.startTime > endTime) return false
        }
        return true
      })

      if (timeConflicts.length > 0) {
        return res.status(409).json({
          error: 'Schedule conflicts with higher-priority schedules',
          conflicts: timeConflicts.map((s) => ({
            id: s.id,
            tier: s.tier,
            mediaName: s.media?.filename || 'Unknown',
          })),
        })
      }
    }

    // Resolve hierarchy IDs for this schedule
    const userFull = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { subcenter: { include: { circle: true } }, circle: true },
    })
    const companyId = req.user!.companyId
      || userFull?.circle?.companyId
      || userFull?.subcenter?.circle?.companyId
      || null
    const circleId = req.user!.circleId
      || userFull?.subcenter?.circleId
      || null

    const schedule = await prisma.scheduleItem.create({
      data: {
        mediaId, tier,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        startTime: startTime || null,
        endTime: endTime || null,
        isRecurring: isRecurring || false,
        isActive: true,
        createdBy: req.user!.id,
        companyId,
        circleId,
        deviceIds: { connect: deviceIds.map((id: string) => ({ id })) },
      },
      include: { media: true, deviceIds: true },
    })

    await logAction({
      userId: req.user!.id,
      action: 'CREATE_SCHEDULE',
      target: `Schedule:${schedule.id}`,
      changes: { mediaId, tier, deviceIds },
      ipAddress: req.ip,
    })

    // Notify affected devices to re-fetch their schedule
    if (ioInstance) {
      for (const dId of deviceIds as string[]) {
        ioInstance.to(`device:${dId}`).emit('SYNC_CONTENT')
      }
    }

    res.status(201).json({
      ...schedule,
      devices: schedule.deviceIds,
      deviceIds: schedule.deviceIds?.map((d: any) => d.id) || [],
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/schedules/:id & POST /api/schedules/:id/update
const handleScheduleUpdate = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const { mediaId, tier, deviceIds, startDate, endDate, startTime, endTime, isRecurring, isActive } = req.body

    const existing = await prisma.scheduleItem.findUnique({
      where: { id },
      include: { deviceIds: true },
    })
    if (!existing) return res.status(404).json({ error: 'Schedule not found' })

    const role = req.user!.role
    const power = rolePowerLevel(role)
    // Must own the schedule OR be higher power
    if (existing.createdBy !== req.user!.id && power <= rolePowerLevel(ROLES.SUBCENTER_ADMIN)) {
      return res.status(403).json({ error: 'Can only edit your own schedules' })
    }

    const updateData: any = {}
    if (mediaId) updateData.mediaId = mediaId
    if (tier) updateData.tier = tier
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
    if (startTime !== undefined) updateData.startTime = startTime || null
    if (endTime !== undefined) updateData.endTime = endTime || null
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring
    if (isActive !== undefined) updateData.isActive = isActive
    if (deviceIds && Array.isArray(deviceIds)) {
      updateData.deviceIds = { set: deviceIds.map((id: string) => ({ id })) }
    }

    const schedule = await prisma.scheduleItem.update({
      where: { id },
      data: updateData,
      include: { media: true, deviceIds: true },
    })

    await logAction({
      userId: req.user!.id,
      action: 'UPDATE_SCHEDULE',
      target: `Schedule:${id}`,
      changes: updateData,
      ipAddress: req.ip,
    })

    // Notify affected devices to re-fetch their schedule
    if (ioInstance && updateData.deviceIds) {
      const updatedDeviceIds = Array.isArray(updateData.deviceIds.set)
        ? updateData.deviceIds.set.map((d: any) => typeof d === 'string' ? d : d.id)
        : []
      for (const dId of updatedDeviceIds) {
        ioInstance.to(`device:${dId}`).emit('SYNC_CONTENT')
      }
    } else if (ioInstance) {
      // If deviceIds unchanged, notify existing devices
      for (const d of existing.deviceIds) {
        ioInstance.to(`device:${d.id}`).emit('SYNC_CONTENT')
      }
    }

    res.json({
      ...schedule,
      devices: schedule.deviceIds,
      deviceIds: schedule.deviceIds?.map((d: any) => d.id) || [],
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.put('/:id', authMiddleware, handleScheduleUpdate)
router.post('/:id/update', authMiddleware, handleScheduleUpdate)
router.post('/:id', authMiddleware, handleScheduleUpdate)

// POST /api/schedules/:id/toggle
router.post('/:id/toggle', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const existing = await prisma.scheduleItem.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Schedule not found' })

    const role = req.user!.role
    const power = rolePowerLevel(role)
    if (existing.createdBy !== req.user!.id && power <= rolePowerLevel(ROLES.SUBCENTER_ADMIN)) {
      return res.status(403).json({ error: 'Can only toggle your own schedules' })
    }

    const schedule = await prisma.scheduleItem.update({
      where: { id },
      data: { isActive: !existing.isActive },
      include: { media: true, deviceIds: true },
    })

    await logAction({
      userId: req.user!.id,
      action: 'TOGGLE_SCHEDULE',
      target: `Schedule:${id}`,
      changes: { isActive: schedule.isActive },
      ipAddress: req.ip,
    })

    // Notify affected devices to re-fetch their schedule
    if (ioInstance) {
      for (const d of schedule.deviceIds) {
        ioInstance.to(`device:${d.id}`).emit('SYNC_CONTENT')
      }
    }

    res.json({
      ...schedule,
      devices: schedule.deviceIds,
      deviceIds: schedule.deviceIds?.map((d: any) => d.id) || [],
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/schedules/:id/override — push emergency override to devices
router.post('/:id/override', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { deviceIds } = req.body
    const role = req.user!.role

    // Only CIRCLE_ADMIN+ can override
    if (rolePowerLevel(role) < rolePowerLevel(ROLES.CIRCLE_ADMIN)) {
      return res.status(403).json({ error: 'Forbidden: Circle Admin or above required' })
    }

    if (!deviceIds || !Array.isArray(deviceIds)) {
      return res.status(400).json({ error: 'deviceIds[] required' })
    }

    const schedule = await prisma.scheduleItem.findUnique({ where: { id } })
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' })

    const media = await prisma.media.findUnique({ where: { id: schedule.mediaId } })
    if (!media) return res.status(404).json({ error: 'Media not found' })

    // Scope: CIRCLE_ADMIN can only override TIER_3 schedules
    if (role === ROLES.CIRCLE_ADMIN && schedule.tier === TIERS.TIER_1) {
      return res.status(403).json({ error: 'Circle Admin cannot override Company-level schedules' })
    }
    // COMPANY_ADMIN cannot override CENTRAL_ADMIN (TIER_1 from central) — but can set TIER_1 themselves
    // CENTRAL_ADMIN can override everything

    const API_URL = process.env.API_URL || 'http://localhost:3001'
    const useTvUrl = media.type === 'VIDEO' && media.tvUrl
    const sourceUrl = useTvUrl ? media.tvUrl : media.url
    const mediaUrl = sourceUrl?.startsWith('http') ? sourceUrl : `${resolvePublicUrl(API_URL, req)}${sourceUrl}`

    if (ioInstance) {
      for (const deviceId of deviceIds as string[]) {
        ioInstance.to(`device:${deviceId}`).emit('PLAY_OVERRIDE', {
          mediaId: schedule.mediaId,
          url: mediaUrl,
          tier: role === ROLES.CIRCLE_ADMIN ? TIERS.TIER_2 : TIERS.TIER_1,
        })
      }
    }

    await logAction({
      userId: req.user!.id,
      action: 'OVERRIDE_SCHEDULE',
      target: `Schedule:${id}`,
      changes: { deviceIds },
      ipAddress: req.ip,
    })

    res.json({ message: 'Override triggered', scheduleId: id, deviceIds })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/schedules/:id & POST /api/schedules/:id/delete
const handleScheduleDelete = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const schedule = await prisma.scheduleItem.findUnique({ where: { id }, include: { deviceIds: true } })
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' })

    const role = req.user!.role
    const power = rolePowerLevel(role)
    if (schedule.createdBy !== req.user!.id && power <= rolePowerLevel(ROLES.SUBCENTER_ADMIN)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Notify affected devices to re-fetch their schedule
    if (ioInstance) {
      for (const d of schedule.deviceIds) {
        ioInstance.to(`device:${d.id}`).emit('SYNC_CONTENT')
      }
    }

    await logAction({
      userId: req.user!.id,
      action: 'DELETE_SCHEDULE',
      target: `Schedule:${id}`,
      ipAddress: req.ip,
    })

    await prisma.scheduleItem.delete({ where: { id } })
    res.json({ message: 'Schedule deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/:id', authMiddleware, handleScheduleDelete)
router.post('/:id/delete', authMiddleware, handleScheduleDelete)

export { router as scheduleRouter }
