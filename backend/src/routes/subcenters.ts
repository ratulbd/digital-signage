import { Router } from 'express'
import { prisma } from '../services/prisma'
import { authMiddleware, requireCircleAdmin } from '../middleware/auth'
import { AuthRequest, ROLES } from '../types'
import { logAction } from '../services/audit'

const router = Router()

// GET /api/subcenters — list subcenters (scoped)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    let where: any = {}

    if (req.user?.role === ROLES.CENTRAL_ADMIN) {
      // sees all
    } else if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      // sees subcenters in circles belonging to their company
      where = { circle: { companyId: req.user.companyId } }
    } else if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId) {
      where = { circleId: req.user.circleId }
    } else if (req.user?.role === ROLES.SUBCENTER_ADMIN && req.user.subcenterId) {
      where = { id: req.user.subcenterId }
    } else {
      return res.json([])
    }

    const subcenters = await prisma.subcenter.findMany({
      where,
      include: {
        circle: { include: { company: true } },
        _count: { select: { users: true, devices: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(subcenters)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/subcenters/by-circle/:circleId — for dropdown
router.get('/by-circle/:circleId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { circleId } = req.params as { circleId: string }

    // Verify access
    if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId !== circleId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      const circle = await prisma.circle.findUnique({ where: { id: circleId } })
      if (!circle || circle.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Forbidden' })
      }
    }

    const subcenters = await prisma.subcenter.findMany({
      where: { circleId },
      include: {
        circle: { include: { company: true } },
        _count: { select: { users: true, devices: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json(subcenters)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/subcenters — create subcenter (CIRCLE_ADMIN+)
router.post('/', authMiddleware, requireCircleAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, circleId } = req.body
    if (!name || !circleId) {
      return res.status(400).json({ error: 'Subcenter name and circleId are required' })
    }

    // Verify ownership
    if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId !== circleId) {
      return res.status(403).json({ error: 'Can only create subcenters in your own circle' })
    }
    if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      const circle = await prisma.circle.findUnique({ where: { id: circleId } })
      if (!circle || circle.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Circle does not belong to your company' })
      }
    }

    const subcenter = await prisma.subcenter.create({
      data: { name, circleId },
      include: {
        circle: { include: { company: true } },
        _count: { select: { users: true, devices: true } },
      },
    })

    // Automatically create a device for this subcenter
    try {
      await prisma.device.create({
        data: {
          name: `${name} Player`,
          isOnline: false,
          subcenterId: subcenter.id
        }
      })
    } catch (err) {
      console.error('Failed to auto-create device for subcenter', err)
    }

    await logAction({
      userId: req.user!.id,
      action: 'CREATE_SUBCENTER',
      target: `Subcenter:${subcenter.id}`,
      changes: {
        name,
        circleId,
        circleName: subcenter.circle?.name || null,
        companyName: subcenter.circle?.company?.name || null,
      },
      ipAddress: req.ip,
    })

    res.status(201).json(subcenter)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/subcenters/:id & POST /api/subcenters/:id/update
const handleSubcenterUpdate = async (req: AuthRequest, res: any) => {
  try {
    const { id } = req.params as { id: string }
    const { name } = req.body

    const existing = await prisma.subcenter.findUnique({
      where: { id },
      include: { circle: { include: { company: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Subcenter not found' })

    // Verify ownership
    if (req.user?.role === ROLES.CIRCLE_ADMIN && existing.circleId !== req.user.circleId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (req.user?.role === ROLES.COMPANY_ADMIN && existing.circle && existing.circle.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const subcenter = await prisma.subcenter.update({
      where: { id },
      data: { name },
      include: {
        circle: { include: { company: true } },
        _count: { select: { users: true, devices: true } },
      },
    })

    res.json(subcenter)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.put('/:id', authMiddleware, requireCircleAdmin, handleSubcenterUpdate)
router.post('/:id/update', authMiddleware, requireCircleAdmin, handleSubcenterUpdate)
router.post('/:id', authMiddleware, requireCircleAdmin, handleSubcenterUpdate)

// DELETE /api/subcenters/:id & POST /api/subcenters/:id/delete
const handleSubcenterDelete = async (req: AuthRequest, res: any) => {
  try {
    const { id } = req.params as { id: string }

    const existing = await prisma.subcenter.findUnique({
      where: { id },
      include: { circle: { include: { company: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Subcenter not found' })

    if (req.user?.role === ROLES.CIRCLE_ADMIN && existing.circleId !== req.user.circleId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (req.user?.role === ROLES.COMPANY_ADMIN && existing.circle && existing.circle.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Check for dependent devices and users
    const deviceCount = await prisma.device.count({ where: { subcenterId: id } })
    const userCount = await prisma.user.count({ where: { subcenterId: id } })
    if (deviceCount > 0 || userCount > 0) {
      return res.status(409).json({
        error: `Cannot delete subcenter — it has ${deviceCount} device(s) and ${userCount} user(s). Reassign or delete them first.`,
      })
    }

    await logAction({
      userId: req.user!.id,
      action: 'DELETE_SUBCENTER',
      target: `Subcenter:${id}`,
      changes: {
        circleName: existing.circle?.name || null,
        companyName: existing.circle?.company?.name || null,
      },
      ipAddress: req.ip,
    })

    await prisma.subcenter.delete({ where: { id } })
    res.json({ message: 'Subcenter deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/:id', authMiddleware, requireCircleAdmin, handleSubcenterDelete)
router.post('/:id/delete', authMiddleware, requireCircleAdmin, handleSubcenterDelete)

export { router as subcenterRouter }
