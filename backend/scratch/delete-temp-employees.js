const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/prismaClient');

async function main() {
  console.log("=== MEMULAI PENGHAPUSAN KARYAWAN SEMENTARA ===");

  // Cari karyawan dengan kriteria sementara
  const temps = await prisma.employee.findMany({
    where: {
      OR: [
        { email: { endsWith: '@system.local' } },
        { name: { startsWith: 'User Mesin' } }
      ]
    }
  });

  if (temps.length === 0) {
    console.log("Tidak ditemukan karyawan sementara untuk dihapus.");
    return;
  }

  console.log(`Ditemukan ${temps.length} karyawan sementara.`);
  
  // Lakukan penghapusan secara massal
  const tempIds = temps.map(t => t.id);

  await prisma.$transaction(async (tx) => {
    // 1. Hapus User terkait login
    const deletedUsers = await tx.user.deleteMany({
      where: { employeeId: { in: tempIds } }
    });
    console.log(`- Berhasil menghapus ${deletedUsers.count} akun user login.`);

    // 2. Hapus Employee secara massal (Prisma akan melakukan Cascade Delete untuk absensi, sidik jari, dll.)
    const deletedEmployees = await tx.employee.deleteMany({
      where: { id: { in: tempIds } }
    });
    console.log(`- Berhasil menghapus ${deletedEmployees.count} profil karyawan sementara.`);
  });

  console.log("\nProses penghapusan selesai! Database sekarang bersih.");
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
