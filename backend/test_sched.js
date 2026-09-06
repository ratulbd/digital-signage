const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const d = await prisma.device.findFirst();
  if(!d) return;
  const res = await fetch('http://localhost:3001/api/devices/' + d.id + '/schedule');
  console.log(JSON.stringify(await res.json(), null, 2));
}
main().finally(() => prisma.$disconnect());
