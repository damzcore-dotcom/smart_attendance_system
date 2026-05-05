const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  const user = await prisma.user.findUnique({
    where: { username: 'damzaja' },
    include: { employee: true }
  });
  console.log('User Record:', JSON.stringify(user, null, 2));
  process.exit(0);
}

checkUser();
