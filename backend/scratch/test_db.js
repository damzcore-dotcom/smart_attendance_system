const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const count = await prisma.user.count();
    console.log('User count:', count);
    process.exit(0);
  } catch (err) {
    console.error('Prisma Error:', err);
    process.exit(1);
  }
}

test();
