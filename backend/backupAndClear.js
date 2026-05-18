const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting backup...');
  const data = {};
  
  // Backup all tables
  const tables = [
    'user', 'managerAccess', 'menuPermission', 'employee', 'department', 'shift', 
    'attendance', 'location', 'correctionRequest', 'settings', 'notification', 
    'leaveRequest', 'announcement', 'massLeave', 'device', 'auditLog', 
    'payrollConfig', 'salaryComponent', 'positionAllowance', 'overtimeRule', 
    'employeeSalary', 'payroll', 'payrollDetail'
  ];

  for (const table of tables) {
    if (prisma[table]) {
      data[table] = await prisma[table].findMany();
    }
  }

  const backupFile = `backup_${Date.now()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`Backup saved to ${backupFile}`);

  console.log('Deleting data...');

  // Delete transactional data
  if (prisma.payrollDetail) await prisma.payrollDetail.deleteMany();
  if (prisma.payroll) await prisma.payroll.deleteMany();
  if (prisma.employeeSalary) await prisma.employeeSalary.deleteMany();
  if (prisma.auditLog) await prisma.auditLog.deleteMany();
  if (prisma.device) await prisma.device.deleteMany();
  if (prisma.massLeave) await prisma.massLeave.deleteMany();
  if (prisma.announcement) await prisma.announcement.deleteMany();
  if (prisma.leaveRequest) await prisma.leaveRequest.deleteMany();
  if (prisma.notification) await prisma.notification.deleteMany();
  if (prisma.correctionRequest) await prisma.correctionRequest.deleteMany();
  if (prisma.attendance) await prisma.attendance.deleteMany();
  
  if (prisma.positionAllowance) await prisma.positionAllowance.deleteMany();

  // Remove relationships from users to employees first
  if (prisma.user) {
    await prisma.user.updateMany({
      data: { employeeId: null }
    });
  }

  // Delete employees
  if (prisma.employee) await prisma.employee.deleteMany();

  // Delete locations, shifts, departments
  if (prisma.location) await prisma.location.deleteMany();
  if (prisma.shift) await prisma.shift.deleteMany();
  if (prisma.department) await prisma.department.deleteMany();

  // Delete non-admin users
  if (prisma.user) {
    await prisma.user.deleteMany({
      where: {
        role: {
          notIn: ['ADMIN', 'SUPER_ADMIN']
        }
      }
    });
  }

  console.log('Database cleared. Kept ADMIN and SUPER_ADMIN users, and system configs (Settings, SalaryComponent, etc).');
}

main()
  .catch(e => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
