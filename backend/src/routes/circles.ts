import { Router } from 'express'
import { prisma } from '../services/prisma'
import { authMiddleware, requireCompanyAdmin } from '../middleware/auth'
import { AuthRequest, ROLES } from '../types'
import { logAction } from '../services/audit'

const router = Router()

// GET /api/circles — list circles (scoped)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    let where: any = {}

    if (req.user?.role === ROLES.CENTRAL_ADMIN) {
      // sees all
    } else if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      where = { companyId: req.user.companyId }
    } else if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId) {
      where = { id: req.user.circleId }
    } else if (req.user?.role === ROLES.SUBCENTER_ADMIN) {
      // Find their circle from their subcenter
      if (req.user.circleId) {
        where = { id: req.user.circleId }
      } else if (req.user.subcenterId) {
        const sub = await prisma.subcenter.findUnique({ where: { id: req.user.subcenterId } })
        if (sub && sub.circleId) where = { id: sub.circleId }
        else return res.json([])
      } else {
        return res.json([])
      }
    }

    const circles = await prisma.circle.findMany({
      where,
      include: {
        company: true,
        _count: { select: { subcenters: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(circles)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/circles/by-company/:companyId — for dropdown
router.get('/by-company/:companyId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { companyId } = req.params as { companyId: string }

    // Verify access
    if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId !== companyId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const circles = await prisma.circle.findMany({
      where: { companyId },
      include: {
        company: true,
        _count: { select: { subcenters: true, users: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json(circles)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/circles — create circle (COMPANY_ADMIN+)
router.post('/', authMiddleware, requireCompanyAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, companyId } = req.body
    if (!name || !companyId) {
      return res.status(400).json({ error: 'Circle name and companyId are required' })
    }

    // COMPANY_ADMIN can only create in own company
    if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId !== companyId) {
      return res.status(403).json({ error: 'Can only create circles in your own company' })
    }

    const circle = await prisma.circle.create({
      data: { name, companyId },
      include: {
        company: true,
        _count: { select: { subcenters: true, users: true } },
      },
    })

    await logAction({
      userId: req.user!.id,
      action: 'CREATE_CIRCLE',
      target: `Circle:${circle.id}`,
      changes: { name, companyId, companyName: circle.company?.name || null },
      ipAddress: req.ip,
    })

    res.status(201).json(circle)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/circles/:id & POST /api/circles/:id/update
const handleCircleUpdate = async (req: AuthRequest, res: any) => {
  try {
    const { id } = req.params as { id: string }
    const { name } = req.body

    // Verify ownership
    if (req.user?.role === ROLES.COMPANY_ADMIN) {
      const existing = await prisma.circle.findUnique({ where: { id } })
      if (!existing || existing.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Forbidden' })
      }
    }

    const circle = await prisma.circle.update({
      where: { id },
      data: { name },
      include: {
        company: true,
        _count: { select: { subcenters: true, users: true } },
      },
    })

    res.json(circle)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.put('/:id', authMiddleware, requireCompanyAdmin, handleCircleUpdate)
router.post('/:id/update', authMiddleware, requireCompanyAdmin, handleCircleUpdate)
router.post('/:id', authMiddleware, requireCompanyAdmin, handleCircleUpdate)

// DELETE /api/circles/:id & POST /api/circles/:id/delete
const handleCircleDelete = async (req: AuthRequest, res: any) => {
  try {
    const { id } = req.params as { id: string }

    let existingCompanyName: string | null = null
    if (req.user?.role === ROLES.COMPANY_ADMIN) {
      const existing = await prisma.circle.findUnique({
        where: { id },
        include: { company: true },
      })
      if (!existing || existing.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      existingCompanyName = existing.company?.name || null
    }

    // Check for dependent subcenters, users, media, schedules
    const subcenterCount = await prisma.subcenter.count({ where: { circleId: id } })
    const userCount = await prisma.user.count({ where: { circleId: id } })
    const mediaCount = await prisma.media.count({ where: { circleId: id } })
    const scheduleCount = await prisma.scheduleItem.count({ where: { circleId: id } })
    if (subcenterCount > 0 || userCount > 0 || mediaCount > 0 || scheduleCount > 0) {
      return res.status(409).json({
        error: `Cannot delete circle — it has ${subcenterCount} subcenter(s), ${userCount} user(s), ${mediaCount} media item(s), and ${scheduleCount} schedule(s). Remove dependencies first.`,
      })
    }

    await logAction({
      userId: req.user!.id,
      action: 'DELETE_CIRCLE',
      target: `Circle:${id}`,
      changes: { companyName: existingCompanyName },
      ipAddress: req.ip,
    })

    await prisma.circle.delete({ where: { id } })
    res.json({ message: 'Circle deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/:id', authMiddleware, requireCompanyAdmin, handleCircleDelete)
router.post('/:id/delete', authMiddleware, requireCompanyAdmin, handleCircleDelete)

export { router as circleRouter }
