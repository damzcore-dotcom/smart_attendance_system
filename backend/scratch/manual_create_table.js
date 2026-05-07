const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTable() {
  try {
    console.log('Creating ManagerAccess table manually...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ManagerAccess" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER UNIQUE NOT NULL,
        "managedDeptId" INTEGER,
        "manageAllDepts" BOOLEAN DEFAULT FALSE,
        CONSTRAINT "ManagerAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
      )
    `);
    console.log('Success!');
  } catch (err) {
    console.log('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTable();
