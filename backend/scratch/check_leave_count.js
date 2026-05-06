const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.leaveRequest.count();
  console.log('Total Leave Requests:', count);
  const all = await prisma.leaveRequest.findMany();
  console.log('Sample IDs:', all.map(l => l.id));
  await prisma.$disconnect();
}

check();
