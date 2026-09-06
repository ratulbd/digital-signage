import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../services/prisma'
import { AuthRequest, ROLES, rolePowerLevel } from '../types'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret'

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export async function deviceAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    if (!decoded.deviceId) {
      return res.status(401).json({ error: 'Invalid device token' })
    }
    req.device = decoded

    // Mark device as paired on first authenticated request
    try {
      const device = await prisma.device.findUnique({
        where: { id: decoded.deviceId },
        select: { pairedAt: true }
      })
      if (device && !device.pairedAt) {
        await prisma.device.update({
          where: { id: decoded.deviceId },
          data: { pairedAt: new Date() }
        })
      }
    } catch {
      // Non-critical: don't fail the request if pairing tracking fails
    }

    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid device token' })
  }
}

export function requireRole(role: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

/** Only CENTRAL_ADMIN */
export function requireCentralAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== ROLES.CENTRAL_ADMIN) {
    return res.status(403).json({ error: 'Forbidden: Central Admin only' })
  }
  next()
}

/** CENTRAL_ADMIN or COMPANY_ADMIN */
export function requireCompanyAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || rolePowerLevel(req.user.role) < rolePowerLevel(ROLES.COMPANY_ADMIN)) {
    return res.status(403).json({ error: 'Forbidden: Company Admin or above required' })
  }
  next()
}

/** CENTRAL_ADMIN, COMPANY_ADMIN, or CIRCLE_ADMIN */
export function requireCircleAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || rolePowerLevel(req.user.role) < rolePowerLevel(ROLES.CIRCLE_ADMIN)) {
    return res.status(403).json({ error: 'Forbidden: Circle Admin or above required' })
  }
  next()
}

/** Any authenticated user (all four roles) */
export function requireAnyAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}
