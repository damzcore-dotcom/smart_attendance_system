const prisma = require('../src/prismaClient');

async function main() {
  // Search for Risma Yanti
  const risma = await prisma.employee.findMany({
    where: { name: { contains: 'Risma', mode: 'insensitive' } },
    select: { id: true, employeeCode: true, name: true, department: { select: { name: true } }, idNumber: true }
  });
  console.log('Risma search:', JSON.stringify(risma, null, 2));
  
  // Check if any employee has idNumber matching 2507020451
  const byIdNumber = await prisma.employee.findMany({
    where: { idNumber: '2507020451' },
    select: { id: true, employeeCode: true, name: true }
  });
  console.log('By ID Number 2507020451:', JSON.stringify(byIdNumber));
  
  // Check FINISHING department
  const finishing = await prisma.employee.findMany({
    where: { department: { name: { contains: 'FINISHING', mode: 'insensitive' } } },
    select: { id: true, employeeCode: true, name: true, department: { select: { name: true } } },
    take: 5
  });
  console.log('FINISHING dept employees:', JSON.stringify(finishing, null, 2));
  
  await prisma.$disconnect();
}
main();
