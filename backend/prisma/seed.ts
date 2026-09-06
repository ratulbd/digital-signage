import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10)

  const subcenter = await prisma.subcenter.create({
    data: {
      name: 'Main Subcenter',
    },
  })

  const centralAdmin = await prisma.user.create({
    data: {
      email: 'central@example.com',
      passwordHash,
      role: 'CENTRAL_ADMIN',
      emailVerified: true,
      mustChangePassword: false,
    },
  })

  const subcenterAdmin = await prisma.user.create({
    data: {
      email: 'local@example.com',
      passwordHash,
      role: 'SUBCENTER_ADMIN',
      subcenterId: subcenter.id,
      emailVerified: true,
      mustChangePassword: false,
    },
  })

  const device = await prisma.device.create({
    data: {
      name: 'Lobby TV 01',
      subcenterId: subcenter.id,
      isOnline: false,
    },
  })

  // Seed default media categories and types (global, companyId = null)
  const defaultCategories = [
    {
      name: 'HSSE Content',
      types: ['TBT', 'Defensive Driving', 'Roaster'],
    },
    {
      name: 'Announcement',
      types: ['Company Notice', 'Urgent Notice'],
    },
  ]

  for (const cat of defaultCategories) {
    const category = await prisma.mediaCategory.create({
      data: {
        name: cat.name,
        companyId: null,
      },
    })
    for (const typeName of cat.types) {
      await prisma.mediaContentType.create({
        data: {
          name: typeName,
          categoryId: category.id,
          companyId: null,
        },
      })
    }
  }

  console.log('Seed completed:')
  console.log({ centralAdmin, subcenterAdmin, subcenter, device })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
