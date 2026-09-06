import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../services/prisma'
import { authMiddleware } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        circleId: user.circleId,
        subcenterId: user.subcenterId,
        mustChangePassword: user.mustChangePassword,
        emailVerified: user.emailVerified,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        circleId: user.circleId,
        subcenterId: user.subcenterId,
        mustChangePassword: user.mustChangePassword,
        emailVerified: user.emailVerified,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/verify — verify email code
router.post('/verify', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Code required' })

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })

    if (user.verificationCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationCode: null },
    })

    res.json({ message: 'Email verified successfully' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/resend-code — resend verification code email
router.post('/resend-code', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (user.emailVerified) return res.status(400).json({ error: 'Email already verified' })

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationCode },
    })

    const { sendVerificationMail } = await import('../services/mail')
    await sendVerificationMail(user.email, verificationCode)

    res.json({ message: 'Verification code sent to ' + user.email })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/forgot-password — request password reset OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email address is required' })

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    })

    if (!user) {
      return res.status(404).json({ error: 'No account found with this email address.' })
    }

    if (!user.emailVerified) {
      return res.status(400).json({ error: 'This account has not been activated yet. Please complete your initial verification.' })
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationCode },
    })

    const { sendPasswordResetMail } = await import('../services/mail')
    await sendPasswordResetMail(user.email, verificationCode)

    res.json({ message: 'A 6-digit password reset code has been sent to ' + user.email })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/reset-password — verify OTP and apply new password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, verification code, and new password are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' })
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!user.verificationCode || user.verificationCode !== code.trim()) {
      return res.status(400).json({ error: 'Invalid or expired verification code' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        verificationCode: null,
        mustChangePassword: false
      },
    })

    const { logAction } = await import('../services/audit')
    await logAction({
      userId: user.id,
      action: 'RESET_PASSWORD',
      target: `User:${user.id}`,
      ipAddress: req.ip,
    })

    res.json({ message: 'Password has been reset successfully! You can now log in.' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/change-password — force change
router.post('/change-password', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { newPassword } = req.body
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash, mustChangePassword: false },
    })

    const { logAction } = await import('../services/audit')
    await logAction({
      userId: req.user!.id,
      action: 'CHANGE_PASSWORD',
      target: `User:${req.user!.id}`,
      ipAddress: req.ip,
    })

    res.json({ message: 'Password updated successfully' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        circleId: true,
        subcenterId: true,
        mustChangePassword: true,
        emailVerified: true,
      },
    })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json({ user })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export { router as authRouter }
