const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/prismaClient');

// Fuzzy match helper
function cleanName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ') // Remove special chars
    .replace(/\s+/g, ' ')       // Normalize spaces
    .trim();
}

async function main() {
  console.log("=== MEMULAI PROSES MERGE KARYAWAN SEMENTARA ===");

  const temps = await prisma.employee.findMany({
    where: {
      OR: [
        { email: { endsWith: '@system.local' } },
        { name: { startsWith: 'User Mesin' } }
      ]
    }
  });

  const reals = await prisma.employee.findMany({
    where: {
      NOT: [
        { email: { endsWith: '@system.local' } },
        { name: { startsWith: 'User Mesin' } }
      ]
    }
  });

  console.log(`Ditemukan Karyawan Sementara: ${temps.length}`);
  console.log(`Ditemukan Karyawan Riil (Kandidat): ${reals.length}`);

  let mergedCount = 0;

  for (const temp of temps) {
    const tempClean = cleanName(temp.name);
    
    // Cari kecocokan nama (exact atau kemiripan kata)
    const match = reals.find(r => cleanName(r.name) === tempClean);

    if (match) {
      console.log(`\n-------------------------------------------------`);
      console.log(`Mencocokkan: "${temp.name}" (Temp ID: ${temp.id})`);
      console.log(`---> Cocok dengan: "${match.name}" (Real NIK: ${match.employeeCode}, Real ID: ${match.id})`);

      await prisma.$transaction(async (tx) => {
        // 1. Update fingerPrintId karyawan asli
        await tx.employee.update({
          where: { id: match.id },
          data: { fingerPrintId: temp.fingerPrintId }
        });
        console.log(`   [Update] Set fingerPrintId ke: ${temp.fingerPrintId}`);

        // 2. Pindahkan data Attendance (Absensi)
        const attUpdate = await tx.attendance.updateMany({
          where: { employeeId: temp.id },
          data: { employeeId: match.id }
        });
        console.log(`   [Absensi] Dipindahkan ${attUpdate.count} log absensi`);

        // 3. Pindahkan data Shift Overrides
        const overrideUpdate = await tx.employeeShiftOverride.updateMany({
          where: { employeeId: temp.id },
          data: { employeeId: match.id }
        });
        console.log(`   [Shift Override] Dipindahkan ${overrideUpdate.count} data`);

        // 4. Pindahkan data Finger Template
        const templateUpdate = await tx.fingerTemplate.updateMany({
          where: { employeeId: temp.id },
          data: { employeeId: match.id }
        });
        console.log(`   [Finger Template] Dipindahkan ${templateUpdate.count} data`);

        // 5. Pindahkan data DeviceUser
        await tx.deviceUser.updateMany({
          where: { employeeId: temp.id },
          data: { employeeId: match.id }
        }).catch(() => {}); // optional

        // 6. Hapus user login dari karyawan sementara (jika ada)
        await tx.user.deleteMany({
          where: { employeeId: temp.id }
        });

        // 7. Hapus karyawan sementara
        await tx.employee.delete({
          where: { id: temp.id }
        });
        console.log(`   [Hapus] Karyawan sementara berhasil dihapus dari database`);
      });

      mergedCount++;
    }
  }

  console.log(`\n=================================================`);
  console.log(`Merge selesai! Berhasil menggabungkan ${mergedCount} karyawan.`);
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
