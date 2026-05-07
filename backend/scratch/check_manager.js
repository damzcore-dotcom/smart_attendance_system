const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkManager() {
  const user = await prisma.user.findUnique({
    where: { username: 'Manager' },
    include: { employee: true }
  });
  console.log('User found:', JSON.stringify(user, null, 2));
}

checkManager();
