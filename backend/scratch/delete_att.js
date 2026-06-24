const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const empCode = '2606091574';
  const deleted = await prisma.attendance.deleteMany({
    where: { employee: { employeeCode: empCode } }
  });
  console.log('Deleted attendance records:', deleted);
}

main().catch(console.error).finally(() => prisma.$disconnect());
