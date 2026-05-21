const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.employee.updateMany({
    where: { faceDescriptor: { not: null } },
    data: { faceStatus: 'ENROLLED' }
  });
  console.log('Fixed ' + result.count + ' employees!');
}

main().finally(() => prisma.$disconnect());
