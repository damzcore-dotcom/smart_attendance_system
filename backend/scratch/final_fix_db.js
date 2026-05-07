const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  try {
    // Try both quoted and unquoted just in case
    console.log('Attempting to add column...');
    await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN "managedDeptId" INTEGER`;
    console.log('Success adding managedDeptId');
  } catch (err) {
    console.log('Error adding managedDeptId:', err.message);
    try {
       await prisma.$executeRaw`ALTER TABLE "user" ADD COLUMN "managedDeptId" INTEGER`;
       console.log('Success adding to lowercase user table');
    } catch (err2) {
       console.log('Error adding to lowercase user table:', err2.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

fix();
