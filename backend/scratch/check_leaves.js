const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const leaves = await prisma.leaveRequest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log('Recent Leave Requests:');
  leaves.forEach(l => {
    console.log(`- ID: ${l.id}, Status: ${l.status}, Type: ${l.type}, Start: ${l.startDate.toISOString()}, End: ${l.endDate.toISOString()}`);
  });

  await prisma.$disconnect();
}

check();
