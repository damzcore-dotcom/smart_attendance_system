const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  console.log('Range:', today.toISOString(), 'to', tomorrow.toISOString());

  const records = await prisma.attendance.findMany({
    include: { employee: true }
  });

  console.log('Total Attendance Records:', records.length);
  if (records.length > 0) {
    console.log('Sample Record Date:', records[0].date.toISOString());
    console.log('Sample Record Status:', records[0].status);
  }

  const todayRecords = await prisma.attendance.findMany({
    where: { date: { gte: today, lt: tomorrow } },
  });
  console.log('Today Records found:', todayRecords.length);

  await prisma.$disconnect();
}

check();
