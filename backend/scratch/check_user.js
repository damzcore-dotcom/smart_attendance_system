const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { username: '2606091574' },
    include: { employee: true }
  });
  console.log('USER BY USERNAME:', JSON.stringify(user, null, 2));

  const emp = await prisma.employee.findFirst({
    where: { nik: '2606091574' },
    include: { user: true }
  });
  console.log('EMPLOYEE BY NIK:', JSON.stringify(emp, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
