const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSequences() {
  console.log("Mulai memperbaiki urutan ID (sequence) PostgreSQL...");
  const models = [
    'Department', 'Shift', 'Location', 'Employee', 'User', 
    'MenuPermission', 'Attendance', 'CorrectionRequest', 
    'LeaveRequest', 'Announcement', 'Notification', 'Settings',
    'MassLeave'
  ];

  for (const model of models) {
    try {
      // Menggunakan executeRawUnsafe untuk menjalankan query reset sequence khusus PostgreSQL
      await prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('"${model}"', 'id'), 
          COALESCE((SELECT MAX(id) FROM "${model}"), 0) + 1, 
          false
        );
      `);
      console.log(`✅ Sequence untuk tabel ${model} berhasil direset.`);
    } catch (e) {
      // Beberapa tabel mungkin tidak punya sequence atau error, kita lewati saja
      console.error(`⚠️ Gagal mereset sequence ${model} (mungkin tidak ada sequence):`, e.message);
    }
  }
  console.log("Selesai!");
}

fixSequences()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
