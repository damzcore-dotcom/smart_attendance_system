const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { calculateLateness } = require('../src/utils/lateCalculator');

async function checkRecalculate() {
  console.log('--- Checking Attendance Records for April 2026 ---');
  
  const startDate = new Date('2026-04-01T00:00:00Z');
  const endDate = new Date('2026-04-30T23:59:59Z');

  const totalInRange = await prisma.attendance.count({
    where: {
      date: { gte: startDate, lte: endDate },
      checkIn: { not: null }
    }
  });

  console.log(`Total records with check-in in April 2026: ${totalInRange}`);

  const attendance = await prisma.attendance.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    include: {
      employee: {
        include: {
          shift: true
        }
      }
    },
    take: 10
  });

  if (attendance.length === 0) {
    console.log('No attendance records found for this range.');
    const count = await prisma.attendance.count();
    console.log('Total attendance records in DB:', count);
    return;
  }

  console.log(`Found ${attendance.length} records. Sample check:`);
  
  attendance.forEach(record => {
    const checkIn = record.checkIn;
    if (!checkIn) {
      console.log(`Record ID ${record.id}: No check-in time.`);
      return;
    }

    const shift = record.employee.shift;
    if (!shift) {
      console.log(`Record ID ${record.id}: Employee ${record.employee.name} has no shift assigned.`);
      return;
    }

    const { lateMinutes: simLate, status: simStatus } = calculateLateness(checkIn, shift.startTime, shift.gracePeriod);

    console.log(`\nRecord ID: ${record.id}`);
    console.log(`Employee: ${record.employee.name} (NIK: ${record.employee.employeeCode})`);
    console.log(`Shift: ${shift.name} (Start: ${shift.startTime}, Grace: ${shift.gracePeriod} min)`);
    console.log(`Check-In: ${checkIn.toISOString()}`);
    console.log(`Current DB -> Late: ${record.lateMinutes}, Status: ${record.status}`);
    console.log(`Simulated  -> Late: ${simLate}, Status: ${simStatus}`);
    console.log(`Needs Update: ${record.status !== simStatus || record.lateMinutes !== simLate ? 'YES' : 'NO'}`);
  });
}

checkRecalculate()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
