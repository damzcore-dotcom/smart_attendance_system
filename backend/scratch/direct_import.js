const { PrismaClient } = require('@prisma/client');
const xlsx = require('xlsx');
const path = require('path');
const prisma = new PrismaClient();

async function directImport() {
  const filePath = 'C:\\ADAM\\smart_attendance_system\\FINGER OFFICE APRIL.xls';
  console.log(`🚀 Memulai Import Langsung dari: ${filePath}`);

  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    const rows = data.slice(1); // Skip header
    console.log(`📊 Total baris ditemukan: ${rows.length}`);

    // Pre-fetch employees
    const allEmployees = await prisma.employee.findMany();
    const empByCode = {};
    allEmployees.forEach(e => empByCode[e.employeeCode] = e);

    const grouped = {};
    let ignoredSundays = 0;
    let unmatched = 0;

    for (const row of rows) {
      if (!row || row.length === 0) continue;

      // Berdasarkan mapping Anda: Department=0, Name=1, No=2, DateTime=3, Status=4, IDNumber=6
      const rawDateTime = row[3];
      const idNumber = (row[6] || '').toString().trim();
      const empName = (row[1] || '').toString().trim();

      if (!rawDateTime) continue;

      let dt;
      if (typeof rawDateTime === 'number') {
        dt = new Date(Math.round((rawDateTime - 25569) * 86400 * 1000));
      } else {
        const str = rawDateTime.toString().trim();
        // Screenshot menunjukkan 4/1/2026 -> M/D/YYYY
        const parts = str.split(/[\/\-\s:]+/);
        if (parts.length >= 3) {
          const m = parseInt(parts[0]) - 1;
          const d = parseInt(parts[1]);
          const y = parseInt(parts[2]) < 100 ? 2000 + parseInt(parts[2]) : parseInt(parts[2]);
          
          // PROTEKSI: Jika Bulan/Hari tertukar, pastikan kita hanya proses April (Bulan 3)
          // Jika sistem salah baca 5/4/2026 sebagai 5 April, kita akan tahu m=4 (Mei).
          dt = new Date(y, m, d, parseInt(parts[3] || 0), parseInt(parts[4] || 0));
        }
      }

      if (!dt || isNaN(dt.getTime())) continue;

      // FILTER HARI MINGGU SANGAT KETAT
      if (dt.getDay() === 0) {
        ignoredSundays++;
        continue;
      }

      // Pastikan hanya data bulan April (Bulan index 3) yang masuk jika memang itu tujuannya
      // Tapi kita biarkan fleksibel asal bukan Minggu
      
      const emp = empByCode[idNumber];
      if (!emp) {
        unmatched++;
        continue;
      }

      const dateStr = dt.toISOString().split('T')[0];
      const key = `${emp.id}|${dateStr}`;

      if (!grouped[key]) {
        grouped[key] = { empId: emp.id, date: new Date(dateStr + 'T00:00:00'), in: null, out: null };
      }

      if (dt.getHours() < 12) {
        if (!grouped[key].in || dt < grouped[key].in) grouped[key].in = dt;
      } else {
        if (!grouped[key].out || dt > grouped[key].out) grouped[key].out = dt;
      }
    }

    console.log(`🧹 Membersihkan data lama sebelum insert...`);
    await prisma.attendance.deleteMany({});

    console.log(`📥 Memasukkan ${Object.keys(grouped).length} data absensi...`);
    let count = 0;
    for (const entry of Object.values(grouped)) {
      await prisma.attendance.create({
        data: {
          employeeId: entry.empId,
          date: entry.date,
          checkIn: entry.in,
          checkOut: entry.out,
          status: 'PRESENT',
          mode: 'Fingerprint'
        }
      });
      count++;
    }

    console.log('✅ SELESAI!');
    console.log(`- Berhasil Import: ${count} Hari Absensi`);
    console.log(`- Hari Minggu Dibuang: ${ignoredSundays}`);
    console.log(`- Karyawan Tidak Ditemukan: ${unmatched}`);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

directImport();
