const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      role: {
        in: ['ADMIN', 'SUPER_ADMIN']
      }
    }
  });

  console.log(`Found ${users.length} admin/super-admin users. Seeding contracts permission...`);

  for (const user of users) {
    await prisma.menuPermission.upsert({
      where: {
        userId_menuKey: {
          userId: user.id,
          menuKey: 'contracts'
        }
      },
      update: {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true
      },
      create: {
        userId: user.id,
        menuKey: 'contracts',
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true
      }
    });
    console.log(`- "contracts" permission set to full access for: ${user.username} (${user.role})`);
  }

  console.log('Seeding contracts permission done!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
