const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const prisma = new PrismaClient();

async function directImport() {
  const filePath = 'C:\\ADAM\\smart_attendance_system\\akbarfinger.xlsx';
  console.log(`🚀 MEMULAI DIRECT IMPORT: ${filePath}`);

  try {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    // Skip header
    const rows = data.slice(1);
    
    // Pre-fetch employees
    const employees = await prisma.employee.findMany();
    const empByCode = {};
    const empByName = {};
    employees.forEach(e => {
      empByCode[e.employeeCode.toString().trim()] = e;
      empByName[e.name.toLowerCase().trim()] = e;
    });

    const grouped = {};
    let ignoredSundays = 0;

    for (const row of rows) {
      if (!row || row.length < 3) continue;

      const rawName = (row[1] || '').toString().trim();
      const rawDateTime = (row[2] || '').toString().trim();
      const rawId = (row[4] || '').toString().trim();

      if (!rawDateTime) continue;

      // Strict Date Parsing
      const dt = new Date(rawDateTime);
      if (isNaN(dt.getTime())) continue;

      // BLOCK SUNDAY (Tanggal 5 April 2026)
      if (dt.getDay() === 0) {
        ignoredSundays++;
        continue;
      }

      const emp = empByCode[rawId] || empByName[rawName.toLowerCase()];
      if (!emp) continue;

      const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const key = `${emp.id}|${dateStr}`;

      if (!grouped[key]) {
        grouped[key] = { employeeId: emp.id, date: new Date(dateStr + 'T00:00:00'), checkIn: null, checkOut: null };
      }

      if (dt.getHours() < 12) {
        if (!grouped[key].checkIn || dt < grouped[key].checkIn) grouped[key].checkIn = dt;
      } else {
        if (!grouped[key].checkOut || dt > grouped[key].checkOut) grouped[key].checkOut = dt;
      }
    }

    console.log(`📊 Processing ${Object.keys(grouped).length} attendance records...`);

    for (const entry of Object.values(grouped)) {
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: entry.employeeId, date: entry.date } },
        update: {
          checkIn: entry.checkIn,
          checkOut: entry.checkOut,
          status: entry.checkIn && entry.checkOut ? 'PRESENT' : 'INCOMPLETE',
          mode: 'DirectImport'
        },
        create: {
          employeeId: entry.employeeId,
          date: entry.date,
          checkIn: entry.checkIn,
          checkOut: entry.checkOut,
          status: entry.checkIn && entry.checkOut ? 'PRESENT' : 'INCOMPLETE',
          mode: 'DirectImport'
        }
      });
    }

    console.log(`✅ IMPORT BERHASIL!`);
    console.log(`✅ Record Tersimpan: ${Object.keys(grouped).length}`);
    console.log(`🚫 Minggu Dibuang: ${ignoredSundays}`);
    
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

directImport();
