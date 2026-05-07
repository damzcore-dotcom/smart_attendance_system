const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  const queries = [
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managedDeptId" INTEGER',
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "manageAllDepts" BOOLEAN DEFAULT FALSE',
    'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "managedDeptId" INTEGER',
    'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "manageAllDepts" BOOLEAN DEFAULT FALSE',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "managedDeptId" INTEGER',
    'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "manageAllDepts" BOOLEAN DEFAULT FALSE'
  ];
  
  for (const q of queries) {
    try {
      console.log(`Executing: ${q}`);
      await prisma.$executeRawUnsafe(q);
      console.log('Success!');
    } catch (err) {
      console.log(`Failed: ${err.message}`);
    }
  }
}

fix();
