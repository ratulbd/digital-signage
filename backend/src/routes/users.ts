import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../services/prisma'
import { authMiddleware, requireCircleAdmin } from '../middleware/auth'
import { AuthRequest, ROLES, rolePowerLevel } from '../types'
import { sendVerificationMail } from '../services/mail'
import { logAction } from '../services/audit'

const router = Router()

// GET /api/users — list users (scoped by role)
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    let where: any = {}

    if (req.user?.role === ROLES.CENTRAL_ADMIN) {
      // sees all
    } else if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      // sees users in own company (CIRCLE_ADMIN + SUBCENTER_ADMIN) + own company admins
      where = { companyId: req.user.companyId }
    } else if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId) {
      // sees users in own circle (SUBCENTER_ADMIN) and self
      where = {
        OR: [
          { circleId: req.user.circleId },
          { id: req.user.id },
        ],
      }
    } else {
      // SUBCENTER_ADMIN — only see self
      where = { id: req.user!.id }
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        company: true,
        circle: true,
        subcenter: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Strip passwordHash
    const safeUsers = users.map(({ passwordHash, ...u }) => u)
    res.json(safeUsers)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/users — create user (role-scoped)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role, companyId, circleId, subcenterId } = req.body
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role required' })
    }

    const creatorPower = rolePowerLevel(req.user!.role)
    const targetPower = rolePowerLevel(role)

    // CENTRAL_ADMIN can create anyone (including other CENTRAL_ADMIN)
    // Others can only create roles below theirs
    if (req.user?.role !== ROLES.CENTRAL_ADMIN && targetPower >= creatorPower) {
      return res.status(403).json({ error: 'Cannot create a user with equal or higher role than yours' })
    }

    // Validate scope
    if (role === ROLES.COMPANY_ADMIN) {
      if (!companyId) return res.status(400).json({ error: 'companyId required for COMPANY_ADMIN' })
      if (req.user?.role !== ROLES.CENTRAL_ADMIN) {
        return res.status(403).json({ error: 'Only CENTRAL_ADMIN can create COMPANY_ADMIN users' })
      }
    }

    if (role === ROLES.CIRCLE_ADMIN) {
      if (!circleId || !companyId) {
        return res.status(400).json({ error: 'companyId and circleId required for CIRCLE_ADMIN' })
      }
      // COMPANY_ADMIN can only assign to circles in their company
      if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId !== companyId) {
        return res.status(403).json({ error: 'Can only create users in your own company' })
      }
    }

    if (role === ROLES.SUBCENTER_ADMIN) {
      if (!subcenterId) {
        return res.status(400).json({ error: 'subcenterId required for SUBCENTER_ADMIN' })
      }
      // Verify subcenter belongs to circle belongs to company in scope
      const subcenter = await prisma.subcenter.findUnique({
        where: { id: subcenterId },
        include: { circle: true },
      })
      if (!subcenter) return res.status(400).json({ error: 'Subcenter not found' })

      if (req.user?.role === ROLES.CIRCLE_ADMIN && subcenter.circleId !== req.user.circleId) {
        return res.status(403).json({ error: 'Subcenter is not in your circle' })
      }
      if (req.user?.role === ROLES.COMPANY_ADMIN && subcenter.circle && subcenter.circle.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Subcenter is not in your company' })
      }
    }

    // Check duplicate email
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ error: 'Email already exists' })

    const passwordHash = await bcrypt.hash(password, 10)

    // Auto-resolve hierarchy IDs
    let resolvedCompanyId = companyId || null
    let resolvedCircleId = circleId || null
    let resolvedSubcenterId = subcenterId || null

    // For SUBCENTER_ADMIN, auto-fill circle & company from subcenter
    if (role === ROLES.SUBCENTER_ADMIN && subcenterId) {
      const sub = await prisma.subcenter.findUnique({
        where: { id: subcenterId },
        include: { circle: true },
      })
      if (sub && sub.circle) {
        resolvedCircleId = sub.circleId
        resolvedCompanyId = sub.circle.companyId
      }
    }

    // For CIRCLE_ADMIN, auto-fill company from circle
    if (role === ROLES.CIRCLE_ADMIN && circleId) {
      const circ = await prisma.circle.findUnique({ where: { id: circleId } })
      if (circ) {
        resolvedCompanyId = circ.companyId
      }
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    const user = await prisma.user.create({
      data: {
        name: name || null,
        email,
        passwordHash,
        role,
        companyId: resolvedCompanyId,
        circleId: resolvedCircleId,
        subcenterId: resolvedSubcenterId,
        verificationCode,
        mustChangePassword: true,
      },
      include: {
        company: true,
        circle: true,
        subcenter: true,
      },
    })

    // Send Actual Email
    try {
      await sendVerificationMail(email, verificationCode)
    } catch (err) {
      console.error('Email sending failed, but user was created.')
    }

    await logAction({
      userId: req.user!.id,
      action: 'CREATE_USER',
      target: `User:${user.id}`,
      changes: {
        email,
        role,
        circleName: user.circle?.name || null,
        companyName: user.company?.name || null,
      },
      ipAddress: req.ip,
    })

    const { passwordHash: _, ...safeUser } = user
    res.status(201).json(safeUser)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Update User Handler (supports PUT /:id, POST /:id, POST /:id/update)
const handleUserUpdate = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const { name, email, password, role } = req.body

    const target = await prisma.user.findUnique({
      where: { id },
      include: { company: true, circle: true },
    })
    if (!target) return res.status(404).json({ error: 'User not found' })

    const creatorPower = rolePowerLevel(req.user?.role || '')
    const targetPower = rolePowerLevel(target.role || '')

    const isSelf = String(id).trim() === String(req.user?.id).trim()
    const isCentral = req.user?.role === ROLES.CENTRAL_ADMIN
    const isCompanyAdmin = req.user?.role === ROLES.COMPANY_ADMIN && (target.companyId === req.user.companyId || !target.companyId)
    const isCircleAdmin = req.user?.role === ROLES.CIRCLE_ADMIN && (target.circleId === req.user.circleId || !target.circleId)
    const hasHigherOrEqualPower = creatorPower >= targetPower

    console.log(`[USER_UPDATE_REQUEST] User ${req.user?.email} (${req.user?.role}) -> Editing ${target.email} (${target.role})`, {
      isSelf, isCentral, isCompanyAdmin, isCircleAdmin, hasHigherOrEqualPower
    })

    if (!isSelf && !isCentral && !isCompanyAdmin && !isCircleAdmin && !hasHigherOrEqualPower) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions to edit this user' })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    
    let emailChanged = false
    if (email !== undefined && email !== target.email) {
      updateData.email = email
      updateData.emailVerified = false
      updateData.verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
      emailChanged = true
    }

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10)
    }
    // Only higher power can change roles
    if (role && id !== req.user!.id && creatorPower > rolePowerLevel(role)) {
      updateData.role = role
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        company: true,
        circle: true,
        subcenter: true,
      },
    })

    if (emailChanged) {
      try {
        await sendVerificationMail(user.email, user.verificationCode!)
      } catch (err) {
        console.error('Re-verification email failed')
      }
    }

    const { passwordHash: _, ...safeUser } = user
    res.json(safeUser)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.put('/:id', authMiddleware, handleUserUpdate)
router.post('/:id/update', authMiddleware, handleUserUpdate)
router.post('/:id', authMiddleware, handleUserUpdate)

// Delete User Handler (supports DELETE /:id and POST /:id/delete)
const handleUserDelete = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const target = await prisma.user.findUnique({
      where: { id },
      include: { company: true, circle: true },
    })
    if (!target) return res.status(404).json({ error: 'User not found' })

    const creatorPower = rolePowerLevel(req.user!.role)
    const targetPower = rolePowerLevel(target.role)

    // Can only delete users with lower power
    if (targetPower >= creatorPower) {
      return res.status(403).json({ error: 'Cannot delete a user with equal or higher role' })
    }

    // Scope check
    if (req.user?.role === ROLES.COMPANY_ADMIN && target.companyId !== req.user.companyId) {
      return res.status(403).json({ error: 'User is not in your company' })
    }
    if (req.user?.role === ROLES.CIRCLE_ADMIN && target.circleId !== req.user.circleId) {
      return res.status(403).json({ error: 'User is not in your circle' })
    }

    // Check for dependent media and schedules
    const mediaCount = await prisma.media.count({ where: { uploadedBy: id } })
    const scheduleCount = await prisma.scheduleItem.count({ where: { createdBy: id } })
    if (mediaCount > 0 || scheduleCount > 0) {
      return res.status(409).json({
        error: `Cannot delete user — they uploaded ${mediaCount} media item(s) and created ${scheduleCount} schedule(s). Reassign or delete them first.`,
      })
    }

    await logAction({
      userId: req.user!.id,
      action: 'DELETE_USER',
      target: `User:${id}`,
      changes: {
        deletedUserId: id,
        circleName: target.circle?.name || null,
        companyName: target.company?.name || null,
      },
      ipAddress: req.ip,
    })

    await prisma.user.delete({ where: { id } })
    res.json({ message: 'User deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/:id', authMiddleware, handleUserDelete)
router.post('/:id/delete', authMiddleware, handleUserDelete)

export { router as userRouter }
