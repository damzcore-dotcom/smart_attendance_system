const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!user) {
      console.log('No admin user found');
      return;
    }
    console.log('Testing getPermissions for user ID:', user.id);
    const permissions = await prisma.menuPermission.findMany({
      where: { userId: user.id }
    });
    console.log('Permissions found:', permissions.length);
    console.log('Sample:', permissions[0]);
  } catch (err) {
    console.error('Test failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
