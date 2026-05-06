const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const employeeId = 1; // Assuming employee 1 exists
    const dateKey = new Date();
    dateKey.setHours(0, 0, 0, 0);
    const attStatus = 'IZIN';

    const result = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: dateKey } },
      update: { status: attStatus, mode: 'Leave System', notes: 'Test leave' },
      create: { employeeId, date: dateKey, status: attStatus, mode: 'Leave System', notes: 'Test leave' }
    });
    console.log('Success:', result);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
