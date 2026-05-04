const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up data...');
  // Delete all attendance records
  await prisma.attendance.deleteMany({});
  console.log('Attendance records deleted.');

  // Delete all users that are linked to employees
  await prisma.user.deleteMany({
    where: { employeeId: { not: null } }
  });
  console.log('Employee users deleted.');

  // Delete all employees
  await prisma.employee.deleteMany({});
  console.log('All employees deleted.');
  
  console.log('Data wipe complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
