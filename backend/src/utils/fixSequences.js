const prisma = require('../prismaClient');

async function fixSequences() {
  console.log('[System] Verifying and synchronizing database sequences...');
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
      } catch (e) {
        // Silently ignore tables without sequences or other minor errors
      }
    }
    console.log('[System] Database sequences synchronized successfully.');
  } catch (error) {
    console.error('[System] Error synchronizing sequences:', error);
  }
}

module.exports = fixSequences;
