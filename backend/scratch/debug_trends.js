const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const now = new Date();
  console.log('System Date:', now.toISOString());
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const records = await prisma.attendance.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
    });

    console.log(`- ${dayStart.toISOString().split('T')[0]}: ${records.length} records`);
  }
  await prisma.$disconnect();
}

check();
