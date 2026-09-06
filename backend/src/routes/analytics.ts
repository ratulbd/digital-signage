import { Router } from 'express'
import { prisma } from '../services/prisma'
import { authMiddleware } from '../middleware/auth'
import { AuthRequest, ROLES } from '../types'

const router = Router()

// Resolve audit log targets (e.g. "Device:uuid") to human-readable names
async function resolveAuditNames(logs: Array<{ target: string }>): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()

  // Parse targets into buckets by type
  const buckets: Record<string, string[]> = {}
  logs.forEach((log) => {
    const match = log.target.match(/^(User|Device|Media|Schedule|Company|Circle|Subcenter):(.*)$/)
    if (match) {
      const [, type, id] = match
      if (!buckets[type]) buckets[type] = []
      buckets[type].push(id)
    }
  })

  // Batch fetch names for each type
  if (buckets.Device?.length) {
    const items = await prisma.device.findMany({
      where: { id: { in: buckets.Device } },
      select: { id: true, name: true },
    })
    items.forEach((d) => nameMap.set(`Device:${d.id}`, d.name))
  }
  if (buckets.User?.length) {
    const items = await prisma.user.findMany({
      where: { id: { in: buckets.User } },
      select: { id: true, name: true, email: true },
    })
    items.forEach((u) => nameMap.set(`User:${u.id}`, u.name || u.email))
  }
  if (buckets.Media?.length) {
    const items = await prisma.media.findMany({
      where: { id: { in: buckets.Media } },
      select: { id: true, filename: true },
    })
    items.forEach((m) => nameMap.set(`Media:${m.id}`, m.filename))
  }
  if (buckets.Schedule?.length) {
    const items = await prisma.scheduleItem.findMany({
      where: { id: { in: buckets.Schedule } },
      include: { media: { select: { filename: true } } },
    })
    items.forEach((s) => nameMap.set(`Schedule:${s.id}`, s.media?.filename || 'schedule'))
  }
  if (buckets.Company?.length) {
    const items = await prisma.company.findMany({
      where: { id: { in: buckets.Company } },
      select: { id: true, name: true },
    })
    items.forEach((c) => nameMap.set(`Company:${c.id}`, c.name))
  }
  if (buckets.Circle?.length) {
    const items = await prisma.circle.findMany({
      where: { id: { in: buckets.Circle } },
      select: { id: true, name: true },
    })
    items.forEach((c) => nameMap.set(`Circle:${c.id}`, c.name))
  }
  if (buckets.Subcenter?.length) {
    const items = await prisma.subcenter.findMany({
      where: { id: { in: buckets.Subcenter } },
      select: { id: true, name: true },
    })
    items.forEach((s) => nameMap.set(`Subcenter:${s.id}`, s.name))
  }

  return nameMap
}

// Format audit log action + target into a human-readable sentence
function formatAuditMessage(
  action: string,
  target: string,
  nameMap: Map<string, string>,
  changes?: Record<string, any> | null
): string {
  const actionMap: Record<string, string> = {
    LOGIN: 'logged in',
    LOGOUT: 'logged out',
    CREATE_USER: 'created user',
    DELETE_USER: 'deleted user',
    CREATE_DEVICE: 'registered device',
    DELETE_DEVICE: 'deleted device',
    PAIR_DEVICE: 'paired device',
    REPAIR_DEVICE: 'generated repair code for',
    CREATE_MEDIA: 'uploaded media',
    DELETE_MEDIA: 'deleted media',
    CREATE_SCHEDULE: 'created schedule',
    UPDATE_SCHEDULE: 'updated schedule',
    DELETE_SCHEDULE: 'deleted schedule',
    TOGGLE_SCHEDULE: 'toggled schedule',
    OVERRIDE_SCHEDULE: 'triggered emergency override',
    CREATE_COMPANY: 'created company',
    DELETE_COMPANY: 'deleted company',
    CREATE_CIRCLE: 'created circle',
    DELETE_CIRCLE: 'deleted circle',
    CREATE_SUBCENTER: 'created subcenter',
    DELETE_SUBCENTER: 'deleted subcenter',
    CHANGE_PASSWORD: 'changed password',
  }
  const verb = actionMap[action] || action.toLowerCase().replace(/_/g, ' ')
  const resolvedName = nameMap.get(target)
  const scName = changes?.subcenterName || null

  // Build parent context string from changes
  const buildContext = (): string => {
    const parts: string[] = []
    if (changes?.circleName) parts.push(changes.circleName)
    if (changes?.companyName) parts.push(changes.companyName)
    if (changes?.subcenterName) parts.push(changes.subcenterName)
    return parts.join(' / ')
  }

  const context = buildContext()

  // Helper to append hierarchy context
  const withContext = (msg: string): string => {
    if (!context) return msg

    if (action === 'DELETE_DEVICE') return `${msg} from ${context}`
    if (action === 'PAIR_DEVICE') return `${msg} with ${context}`
    if (action === 'REPAIR_DEVICE') return `${msg} with ${context}`
    if (action === 'CREATE_DEVICE') return `${msg} in ${context}`

    if (action === 'CREATE_USER' || action === 'DELETE_USER') return `${msg} in ${context}`
    if (action === 'CREATE_CIRCLE' || action === 'DELETE_CIRCLE') return `${msg} in ${context}`
    if (action === 'CREATE_SUBCENTER' || action === 'DELETE_SUBCENTER') return `${msg} in ${context}`

    return msg
  }

  if (resolvedName) {
    return withContext(`${verb} ${resolvedName}`)
  }

  // If entity was deleted, we can't resolve its name — show a clean fallback
  const typeMatch = target.match(/^(User|Device|Media|Schedule|Company|Circle|Subcenter):/)
  if (typeMatch) {
    const type = typeMatch[1].toLowerCase()
    // Strip the entity type from the verb to avoid duplication, e.g. "deleted device" → "deleted a device"
    const cleanVerb = verb.replace(new RegExp(`\\s${type}$`), '').trim()
    return withContext(`${cleanVerb || verb} a ${type}`)
  }

  return `${verb} ${target}`
}

// Helper function to calculate screen time from logs and device status
const calculateTotalHours = (logs: any[], devices: any[]) => {
  const now = Date.now()
  const ONLINE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

  let totalMs = 0

  // 1. Sum up completed logs
  logs.forEach(log => {
    if (log.endedAt) {
      totalMs += new Date(log.endedAt).getTime() - new Date(log.startedAt).getTime()
    } else {
      // 2. Add in-progress time for currently ONLINE devices
      const device = devices.find(d => d.id === log.deviceId)
      const isOnline = device?.isOnline && (now - new Date(device.lastHeartbeat).getTime() < ONLINE_THRESHOLD_MS)
      
      if (isOnline) {
        totalMs += now - new Date(log.startedAt).getTime()
      }
    }
  })

  return totalMs / (1000 * 60 * 60)
}

// Helper function to resolve role-scoped device filters
function getDeviceWhereForUser(user?: AuthRequest['user']): any {
  if (!user) return { id: 'none' }
  if (user.role === ROLES.CENTRAL_ADMIN) {
    return {}
  }
  if (user.role === ROLES.COMPANY_ADMIN && user.companyId) {
    return {
      subcenter: {
        circle: { companyId: user.companyId },
      },
    }
  }
  if (user.role === ROLES.CIRCLE_ADMIN && user.circleId) {
    return {
      subcenter: { circleId: user.circleId },
    }
  }
  if (user.role === ROLES.SUBCENTER_ADMIN && user.subcenterId) {
    return { subcenterId: user.subcenterId }
  }
  return { id: 'none' }
}

router.get('/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const deviceWhere = getDeviceWhereForUser(req.user)

    const totalDevices = await prisma.device.count({ where: deviceWhere })
    const onlineDevicesCount = await prisma.device.count({
      where: { ...deviceWhere, isOnline: true },
    })
    const offlineDevices = totalDevices - onlineDevicesCount

    const devices = await prisma.device.findMany({
      where: deviceWhere,
      select: { id: true, name: true, isOnline: true, lastHeartbeat: true }
    })

    const deviceIds = devices.map(d => d.id)
    const playbackWhere = { deviceId: { in: deviceIds } }

    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)

    // Total vs Today Logs
    const allLogs = await prisma.playbackLog.findMany({ where: playbackWhere })
    const todayLogs = await prisma.playbackLog.findMany({ 
      where: { 
        ...playbackWhere,
        startedAt: { gte: midnight }
      } 
    })

    const totalScreenTimeHrs = calculateTotalHours(allLogs, devices)
    const todayScreenTimeHrs = calculateTotalHours(todayLogs, devices)

    const topMedia = await prisma.media.findMany({
      where: deviceIds.length ? {
            playbackLogs: {
              some: {
                deviceId: { in: deviceIds },
              },
            },
          } : undefined,
      include: {
        _count: {
          select: { playbackLogs: true },
        },
      },
      orderBy: {
        playbackLogs: { _count: 'desc' },
      },
      take: 5,
    })

    const formattedTopMedia = topMedia.map((m) => ({
      id: m.id,
      filename: m.filename,
      url: m.url,
      type: m.type,
      playCount: m._count.playbackLogs,
    }))

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const plays = await prisma.playbackLog.findMany({
      where: {
        ...playbackWhere,
        startedAt: { gte: sevenDaysAgo },
      },
      select: { startedAt: true },
    })

    const playsMap = new Map<string, number>()
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      playsMap.set(key, 0)
    }

    plays.forEach((p) => {
      const key = p.startedAt.toISOString().split('T')[0]
      playsMap.set(key, (playsMap.get(key) || 0) + 1)
    })

    const playsOverTime = Array.from(playsMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    // 1. Fetch heartbeats for all relevant devices in a single query (Batching)
    const allHeartbeats = await prisma.deviceHeartbeat.findMany({
      where: {
        deviceId: { in: deviceIds },
        timestamp: { gte: twentyFourHoursAgo },
      },
      select: { deviceId: true, isOnline: true },
    })

    // 2. Group heartbeats by deviceId
    const heartbeatGroups = allHeartbeats.reduce((acc: any, hb) => {
      if (!acc[hb.deviceId]) acc[hb.deviceId] = []
      acc[hb.deviceId].push(hb)
      return acc
    }, {})

    // 3. Map devices to uptime stats using the grouped data
    const deviceUptime = devices.map((device) => {
      const heartbeats = heartbeatGroups[device.id] || []
      const total = heartbeats.length || 1
      const onlineCount = heartbeats.filter((h: any) => h.isOnline).length
      const uptime = Math.round((onlineCount / total) * 100)

      return {
        deviceId: device.id,
        deviceName: device.name,
        uptime,
      }
    })

    // ── Real metric calculations ─────────────────────────────────────────────

    // Network Quality: % of heartbeats in last 24h where device was online
    const totalHeartbeats = allHeartbeats.length
    const onlineHeartbeats = allHeartbeats.filter((h) => h.isOnline).length
    const networkQuality = totalHeartbeats > 0 ? Math.round((onlineHeartbeats / totalHeartbeats) * 100) : 0

    // Sync Status: % of devices that have at least one schedule assigned
    const schedules = await prisma.scheduleItem.findMany({
      where: deviceIds.length ? { deviceIds: { some: { id: { in: deviceIds } } } } : undefined,
      select: { deviceIds: { select: { id: true } } },
    })
    const syncedDeviceIds = new Set<string>()
    schedules.forEach((s) => {
      s.deviceIds.forEach((d) => {
        if (deviceIds.includes(d.id)) syncedDeviceIds.add(d.id)
      })
    })
    const syncStatus = totalDevices > 0 ? Math.round((syncedDeviceIds.size / totalDevices) * 100) : 0

    // Content Delivery: % of devices that had playback today
    const todayDeviceIds = new Set(todayLogs.map((l) => l.deviceId))
    const contentDelivery = totalDevices > 0 ? Math.round((todayDeviceIds.size / totalDevices) * 100) : 0

    // Recent Activity: last 15 audit logs with resolved names
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 15,
    })
    const nameMap = await resolveAuditNames(auditLogs)
    const recentActivity = auditLogs.map((log) => ({
      id: log.id,
      message: formatAuditMessage(log.action, log.target, nameMap, log.changes as Record<string, any> | null),
      timestamp: log.timestamp.toISOString(),
    }))

    res.json({
      totalDevices,
      onlineDevices: onlineDevicesCount,
      offlineDevices,
      totalPlays: allLogs.length,
      totalScreenTimeHrs,
      todayScreenTimeHrs,
      topMedia: formattedTopMedia,
      playsOverTime,
      deviceUptime,
      networkQuality,
      syncStatus,
      contentDelivery,
      recentActivity,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/notifications', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20,
    })
    const nameMap = await resolveAuditNames(auditLogs)
    const formatted = auditLogs.map((log) => {
      const text = formatAuditMessage(log.action, log.target, nameMap, log.changes as Record<string, any> | null)
      
      let type = 'info'
      if (log.action.startsWith('CREATE') || log.action.startsWith('PAIR') || log.action.startsWith('LOGIN')) {
        type = 'success'
      } else if (log.action.startsWith('DELETE') || log.action.startsWith('CHANGE_PASSWORD')) {
        type = 'warning'
      }

      return {
        id: log.id,
        text,
        type,
        timestamp: log.timestamp.toISOString(),
      }
    })
    res.json(formatted)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/reports', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate, subcenterId, deviceId } = req.query
    
    let where: any = {}
    
    if (startDate || endDate) {
      where.startedAt = {}
      if (startDate) where.startedAt.gte = new Date(startDate as string)
      if (endDate) where.startedAt.lte = new Date(endDate as string)
    }

    if (deviceId) {
      where.deviceId = deviceId as string
    } else if (subcenterId) {
      where.device = { subcenterId: subcenterId as string }
    } else {
      const scopedDeviceWhere = getDeviceWhereForUser(req.user)
      if (Object.keys(scopedDeviceWhere).length > 0) {
        where.device = scopedDeviceWhere
      }
    }

    const logs = await prisma.playbackLog.findMany({
      where,
      include: {
        device: { include: { subcenter: true } },
        media: true
      },
      orderBy: { startedAt: 'desc' },
      take: 100 // Prevent loading massive datasets in a single call
    })

    const devicesForStatus = await prisma.device.findMany({
      select: { id: true, isOnline: true, lastHeartbeat: true }
    })

    // Grouping by Date and Device for the report
    const reportData = logs.map(log => {
      const durationMs = log.endedAt 
        ? new Date(log.endedAt).getTime() - new Date(log.startedAt).getTime()
        : 0 // We'll keep historical reports to completed events for accuracy
      
      return {
        id: log.id,
        date: log.startedAt.toISOString().split('T')[0],
        deviceName: log.device.name,
        subcenterName: log.device.subcenter.name,
        mediaName: log.media.filename,
        durationHrs: durationMs / (1000 * 60 * 60),
        status: log.endedAt ? 'Completed' : 'In Progress'
      }
    })

    const totalHours = calculateTotalHours(logs, devicesForStatus)

    res.json({
      totalHours,
      logs: reportData
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/device/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    const device = await prisma.device.findUnique({
      where: { id },
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

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const logs = await prisma.playbackLog.findMany({
      where: {
        deviceId: id,
        startedAt: { gte: thirtyDaysAgo },
      },
      include: { media: true },
      orderBy: { startedAt: 'desc' },
    })

    res.json(logs)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export { router as analyticsRouter }
