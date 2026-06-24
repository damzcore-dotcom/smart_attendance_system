const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const att = await prisma.attendance.findFirst({
    where: { employee: { employeeCode: '2606091574' } },
    orderBy: { id: 'desc' },
    include: { employee: { include: { shift: true } } }
  });
  console.log(JSON.stringify(att, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
