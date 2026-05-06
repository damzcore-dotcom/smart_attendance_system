const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const records = await prisma.attendance.findMany({
    where: { date: { gte: new Date('2026-05-01') } },
    include: { employee: true }
  });

  console.log(`Found ${records.length} records in May 2026`);
  records.forEach(r => {
    console.log(`- Date: ${r.date.toISOString()}, Status: ${r.status}, Name: ${r.employee.name}`);
  });

  await prisma.$disconnect();
}

check();
