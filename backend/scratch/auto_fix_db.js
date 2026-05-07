const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAndFix() {
  try {
    const columns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'User'`;
    const names = columns.map(c => c.column_name);
    console.log('Existing columns:', names);
    
    if (!names.includes('managedDeptId')) {
      console.log('Adding managedDeptId...');
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "managedDeptId" INTEGER');
    }
    
    if (!names.includes('manageAllDepts')) {
      console.log('Adding manageAllDepts...');
      await prisma.$executeRawUnsafe('ALTER TABLE "User" ADD COLUMN "manageAllDepts" BOOLEAN DEFAULT FALSE');
    }
    
    console.log('Database sync complete!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndFix();
