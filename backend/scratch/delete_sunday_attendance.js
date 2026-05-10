const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanSundays() {
  console.log('🚀 Memulai pembersihan data absensi hari Minggu...');
  
  try {
    // Ambil semua data absensi
    const allAttendance = await prisma.attendance.findMany({
      select: { id: true, date: true }
    });

    // Filter data yang hari Minggu (getDay() === 0)
    const sundayIds = allAttendance
      .filter(record => {
        const d = new Date(record.date);
        return d.getDay() === 0;
      })
      .map(record => record.id);

    if (sundayIds.length === 0) {
      console.log('✅ Tidak ditemukan data absensi hari Minggu.');
      return;
    }

    console.log(`🔍 Ditemukan ${sundayIds.length} data hari Minggu. Menghapus...`);

    // Hapus data berdasarkan ID yang ditemukan
    const deleted = await prisma.attendance.deleteMany({
      where: {
        id: { in: sundayIds }
      }
    });

    console.log(`✅ Berhasil menghapus ${deleted.count} data absensi hari Minggu.`);
  } catch (error) {
    console.error('❌ Terjadi kesalahan:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanSundays();
