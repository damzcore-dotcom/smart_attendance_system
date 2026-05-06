const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.employee.count();
  console.log('Total Employees in DB:', count);
  await prisma.$disconnect();
}

check();
