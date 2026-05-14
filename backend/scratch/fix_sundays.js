const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSundays() {
  console.log('--- Starting Sunday Status Fix ---');
  
  try {
    // 1. Fetch all records that might be Sundays
    // We filter for records that are currently ABSENT and have no activity
    const records = await prisma.attendance.findMany({
      where: {
        status: 'ABSENT',
        checkIn: null,
        checkOut: null
      },
      select: {
        id: true,
        date: true
      }
    });

    console.log(`Found ${records.length} candidate records for inspection.`);

    let updateCount = 0;
    const batchSize = 100;
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const date = new Date(record.date);
      
      // getDay() returns 0 for Sunday
      if (date.getDay() === 0) {
        await prisma.attendance.update({
          where: { id: record.id },
          data: { status: 'HOLIDAY' }
        });
        updateCount++;
        
        if (updateCount % batchSize === 0) {
          console.log(`Progress: Updated ${updateCount} records...`);
        }
      }
    }

    console.log(`--- Success! ---`);
    console.log(`Total records checked: ${records.length}`);
    console.log(`Total records updated to HOLIDAY: ${updateCount}`);

  } catch (error) {
    console.error('Error during update:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixSundays();
