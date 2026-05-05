const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { role: 'ADMIN' }
  });

  const menus = [
    'dashboard', 'attendance', 'employees', 'shifts', 'locations', 'corrections', 'users', 'settings'
  ];

  console.log(`Found ${users.length} admin users. Seeding permissions...`);

  for (const user of users) {
    for (const menu of menus) {
      await prisma.menuPermission.upsert({
        where: { userId_menuKey: { userId: user.id, menuKey: menu } },
        update: {
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true
        },
        create: {
          userId: user.id,
          menuKey: menu,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true
        }
      });
    }
    console.log(`- Permissions seeded for user: ${user.username}`);
  }

  console.log('Done!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
