const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "managedDeptId" INTEGER').catch(e => console.log(e.message));
  await prisma.$executeRawUnsafe('ALTER TABLE public."User" ADD COLUMN "managedDeptId" INTEGER').catch(e => console.log(e.message));
  console.log('Done');
}
run();
