const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() { 
  const emps = await prisma.employee.findMany({where:{name:{contains:'test sistem'}}}); 
  console.log(emps.map(e => ({id: e.id, name: e.name})));
} 
test().finally(() => prisma.$disconnect());
