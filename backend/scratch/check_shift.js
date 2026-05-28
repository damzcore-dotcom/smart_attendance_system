const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { name: { contains: 'Hana Nurhasanah', mode: 'insensitive' } },
    include: { shift: true }
  });

  console.log('Employee shift details:', emp?.shift);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
