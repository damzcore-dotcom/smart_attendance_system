const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { employeeCode: '2606091574' },
    include: { user: true }
  });
  console.log('EMPLOYEE BY employeeCode:', JSON.stringify(emp, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
