const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    let employeeCode = '';
    const allEmployees = await prisma.employee.findMany({ select: { employeeCode: true } });
    let maxNum = 0;
    allEmployees.forEach(emp => {
      const num = parseInt(emp.employeeCode.replace(/\D/g, ''));
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    employeeCode = String(maxNum + 1);

    console.log("Generated employeeCode:", employeeCode);

    const dataObj = {
      employeeCode,
      name: "Tarjono",
      email: "bhl_12345@example.com",
      phone: "",
      position: "CS",
      employmentStatus: "HARIAN",
      salaryCategory: "HARIAN",
      idNumber: "3213051202760001",
    };

    let dept = await prisma.department.findUnique({ where: { name: "CS" } });
    if (!dept) dept = await prisma.department.create({ data: { name: "CS" } });
    dataObj.departmentId = dept.id;

    console.log("Data to insert:", dataObj);

    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({ data: dataObj, include: { department: true } });
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 10);
      await tx.user.create({ data: { username: employeeCode, password: hashedPassword, role: 'EMPLOYEE', employeeId: emp.id, mustChangePassword: true } });
      return emp;
    });

    console.log("Success:", employee.id);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

test();
