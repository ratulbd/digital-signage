import { Router } from 'express'
import { prisma } from '../services/prisma'
import { authMiddleware, requireAnyAdmin } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()

router.get('/', authMiddleware, requireAnyAdmin, async (req: AuthRequest, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500,
    })
    res.json(logs)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export { router as auditRouter }
