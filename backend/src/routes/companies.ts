import { Router } from 'express'
import { prisma } from '../services/prisma'
import { authMiddleware, requireCentralAdmin, requireCompanyAdmin } from '../middleware/auth'
import { AuthRequest, ROLES } from '../types'
import { logAction } from '../services/audit'

const router = Router()

// GET /api/companies — list companies
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (req.user?.role === ROLES.CENTRAL_ADMIN) {
      const companies = await prisma.company.findMany({
        include: {
          _count: { select: { circles: true, users: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
      return res.json(companies)
    }

    if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      const companies = await prisma.company.findMany({
        where: { id: req.user.companyId },
        include: {
          _count: { select: { circles: true, users: true } },
        },
      })
      return res.json(companies)
    }

    // CIRCLE_ADMIN and SUBCENTER_ADMIN can see their own company (read-only)
    if (req.user?.companyId) {
      const companies = await prisma.company.findMany({
        where: { id: req.user.companyId },
        include: {
          _count: { select: { circles: true, users: true } },
        },
      })
      return res.json(companies)
    }

    // Fallback: look up the company from the user's circle or subcenter
    const userFull = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        circle: { include: { company: true } },
        subcenter: { include: { circle: { include: { company: true } } } },
      },
    })
    const companyId = userFull?.companyId
      || userFull?.circle?.companyId
      || userFull?.subcenter?.circle?.companyId

    if (companyId) {
      const companies = await prisma.company.findMany({
        where: { id: companyId },
        include: {
          _count: { select: { circles: true, users: true } },
        },
      })
      return res.json(companies)
    }

    return res.json([])
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/companies — create company (CENTRAL_ADMIN only)
router.post('/', authMiddleware, requireCentralAdmin, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' })
    }

    const existing = await prisma.company.findUnique({ where: { name } })
    if (existing) {
      return res.status(409).json({ error: 'Company name already exists' })
    }

    const company = await prisma.company.create({
      data: { name },
      include: {
        _count: { select: { circles: true, users: true } },
      },
    })

    await logAction({
      userId: req.user!.id,
      action: 'CREATE_COMPANY',
      target: `Company:${company.id}`,
      changes: { name },
      ipAddress: req.ip,
    })

    res.status(201).json(company)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/companies/:id & POST /api/companies/:id/update
const handleCompanyUpdate = async (req: AuthRequest, res: any) => {
  try {
    const { id } = req.params as { id: string }
    const { name } = req.body

    const company = await prisma.company.update({
      where: { id },
      data: { name },
      include: {
        _count: { select: { circles: true, users: true } },
      },
    })

    res.json(company)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.put('/:id', authMiddleware, requireCentralAdmin, handleCompanyUpdate)
router.post('/:id/update', authMiddleware, requireCentralAdmin, handleCompanyUpdate)
router.post('/:id', authMiddleware, requireCentralAdmin, handleCompanyUpdate)

// DELETE /api/companies/:id & POST /api/companies/:id/delete
const handleCompanyDelete = async (req: AuthRequest, res: any) => {
  try {
    const { id } = req.params as { id: string }

    // Check for dependent circles, users, media, schedules
    const circleCount = await prisma.circle.count({ where: { companyId: id } })
    const userCount = await prisma.user.count({ where: { companyId: id } })
    const mediaCount = await prisma.media.count({ where: { companyId: id } })
    const scheduleCount = await prisma.scheduleItem.count({ where: { companyId: id } })
    if (circleCount > 0 || userCount > 0 || mediaCount > 0 || scheduleCount > 0) {
      return res.status(409).json({
        error: `Cannot delete company — it has ${circleCount} circle(s), ${userCount} user(s), ${mediaCount} media item(s), and ${scheduleCount} schedule(s). Remove dependencies first.`,
      })
    }

    await logAction({
      userId: req.user!.id,
      action: 'DELETE_COMPANY',
      target: `Company:${id}`,
      ipAddress: req.ip,
    })

    await prisma.company.delete({ where: { id } })
    res.json({ message: 'Company deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/:id', authMiddleware, requireCentralAdmin, handleCompanyDelete)
router.post('/:id/delete', authMiddleware, requireCentralAdmin, handleCompanyDelete)

export { router as companyRouter }
