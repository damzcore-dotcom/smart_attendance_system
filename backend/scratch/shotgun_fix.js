const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function shotgunFix() {
  console.log('🚀 MEMULAI PEMBERSIHAN PAKSA (SHOTGUN FIX)...');
  
  try {
    // 1. Ambil semua data absensi
    const allAtt = await prisma.attendance.findMany();
    let deletedCount = 0;

    for (const att of allAtt) {
      const d = new Date(att.date);
      
      // KRITERIA PENGHAPUSAN:
      // A. Jika hari Minggu (Day 0)
      // B. Jika data kosong (CheckIn dan CheckOut null)
      if (d.getDay() === 0 || (!att.checkIn && !att.checkOut)) {
        await prisma.attendance.delete({
          where: { id: att.id }
        });
        deletedCount++;
      }
    }

    console.log(`✅ BERHASIL: ${deletedCount} record sampah (termasuk Hari Minggu) telah dihapus.`);
    console.log('ℹ️ Dashboard Anda sekarang seharusnya bersih.');
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

shotgunFix();
