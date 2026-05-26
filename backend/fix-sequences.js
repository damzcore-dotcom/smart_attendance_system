const prisma = require('./src/prismaClient');

async function fixSequences() {
  try {
    const tables = [
      'Attendance', 'Employee', 'User', 'Device', 'Shift', 'Department',
      'Location', 'CorrectionRequest', 'LeaveRequest', 'Notification',
      'Announcement', 'AuditLog', 'MassLeave', 'Settings',
      'PayrollConfig', 'SalaryComponent', 'PositionAllowance', 
      'OvertimeRule', 'EmployeeSalary', 'Payroll', 'PayrollDetail', 
      'CompanyCalendar', 'ManagerAccess', 'MenuPermission'
    ];

    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), coalesce(max(id),0) + 1, false) FROM "${table}";`);
        console.log(`Sequence fixed for ${table}`);
      } catch (e) {
        console.log(`Failed or no sequence for ${table}: ${e.message}`);
      }
    }
    console.log('All sequences synchronized successfully.');
  } catch (error) {
    console.error('Error fixing sequences:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixSequences();
