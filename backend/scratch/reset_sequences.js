const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetSequences() {
  console.log('--- Starting Sequence Reset ---');
  try {
    // Get all tables with serial/autoincrement IDs
    const tables = [
      'User', 'Employee', 'Department', 'Shift', 'Attendance', 
      'Location', 'CorrectionRequest', 'Settings', 'Notification', 
      'LeaveRequest', 'Announcement', 'MassLeave', 'Device', 'AuditLog',
      'ManagerAccess', 'MenuPermission'
    ];

    for (const table of tables) {
      const seqName = `${table}_id_seq`;
      console.log(`Resetting sequence for ${table}...`);
      
      // We use $executeRawUnsafe to set the sequence to the current MAX(id)
      // Double quotes are needed for table/sequence names in PostgreSQL if they have uppercase letters
      await prisma.$executeRawUnsafe(`
        SELECT setval('"${seqName}"', COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false);
      `);
    }

    console.log('--- All sequences reset successfully ---');
  } catch (error) {
    console.error('Error resetting sequences:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetSequences();
