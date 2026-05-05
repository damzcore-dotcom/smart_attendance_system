const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDepts() {
  const depts = await prisma.department.findMany();
  console.log('--- Departments in DB ---');
  console.table(depts);

  const employees = await prisma.employee.findMany({
    select: {
      name: true,
      departmentId: true,
      department: {
        select: { name: true }
      }
    },
    take: 5
  });
  console.log('\n--- Employees Sample ---');
  console.log(JSON.stringify(employees, null, 2));
}

checkDepts()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
