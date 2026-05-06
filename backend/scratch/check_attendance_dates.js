const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const records = await prisma.attendance.findMany({
    orderBy: { date: 'desc' },
    take: 10
  });

  console.log('Last 10 attendance records:');
  records.forEach(r => {
    console.log(`- Date: ${r.date.toISOString()}, Status: ${r.status}, EmpId: ${r.employeeId}`);
  });

  await prisma.$disconnect();
}

check();
