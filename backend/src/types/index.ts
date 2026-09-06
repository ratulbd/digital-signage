import { Request } from 'express'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    name?: string
    role: string
    companyId?: string | null
    circleId?: string | null
    subcenterId?: string | null
  }
  device?: {
    deviceId: string
    name: string
  }
}

export const ROLES = {
  CENTRAL_ADMIN: 'CENTRAL_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  CIRCLE_ADMIN: 'CIRCLE_ADMIN',
  SUBCENTER_ADMIN: 'SUBCENTER_ADMIN',
} as const

export const TIERS = {
  TIER_1: 'TIER_1',
  TIER_2: 'TIER_2',
  TIER_3: 'TIER_3',
} as const

export const MEDIA_TYPES = {
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  DOCUMENT: 'DOCUMENT',
  TEXT: 'TEXT',
} as const

// Helper: hierarchy level number (higher = more power)
export function rolePowerLevel(role: string): number {
  switch (role) {
    case ROLES.CENTRAL_ADMIN: return 4
    case ROLES.COMPANY_ADMIN: return 3
    case ROLES.CIRCLE_ADMIN: return 2
    case ROLES.SUBCENTER_ADMIN: return 1
    default: return 0
  }
}
