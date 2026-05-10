const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function nukeAttendance() {
  console.log('☢️ MEMULAI PENGHAPUSAN TOTAL DATA ABSENSI...');
  
  try {
    const deleted = await prisma.attendance.deleteMany({});
    console.log(`✅ BERHASIL MENGHAPUS SEMUA DATA: ${deleted.count} record telah dimusnahkan.`);
    console.log('ℹ️ Sekarang database Anda kosong. Silakan lakukan Import Excel.');
  } catch (err) {
    console.error('❌ GAGAL MENGHAPUS DATA:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

nukeAttendance();
