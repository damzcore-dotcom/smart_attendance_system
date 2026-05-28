const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const allBhl = await prisma.employee.findMany({ 
    where: { OR: [{ employmentStatus: 'HARIAN' }, { salaryCategory: 'HARIAN' }] }, 
    select: { employeeCode: true } 
  });
  console.log("allBhl:", allBhl);
  
  const bhlUser = await prisma.user.findUnique({ where: { username: 'BHL-0001' } });
  console.log("bhlUser:", bhlUser);
}
check().finally(() => prisma.$disconnect());
