import { prisma } from './prisma'

export async function logAction({
  userId,
  action,
  target,
  changes,
  ipAddress,
}: {
  userId: string
  action: string
  target: string
  changes?: Record<string, any>
  ipAddress?: string
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        target,
        changes: changes || undefined,
        ipAddress: ipAddress || null,
      },
    })
  } catch (err) {
    console.error('Audit log error:', err)
  }
}
