const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  try {
    const emp = await prisma.employee.findFirst({ where: { employeeCode: 'BHL-0001' } });
    if (emp) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { employmentStatus: 'HARIAN', salaryCategory: 'HARIAN' }
      });
      console.log('Fixed employmentStatus for BHL-0001');

      const salary = await prisma.employeeSalary.findFirst({ where: { employeeId: emp.id } });
      if (salary) {
        await prisma.employeeSalary.update({
          where: { id: salary.id },
          data: { employmentType: 'HARIAN', salaryType: 'DAILY' }
        });
        console.log('Fixed employmentType in salary for BHL-0001');
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
fix();
