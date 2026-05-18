const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load Prisma Client from backend
let prisma;
try {
  const { PrismaClient } = require(path.join(__dirname, 'backend', 'node_modules', '@prisma/client'));
  prisma = new PrismaClient();
} catch (e) {
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  } catch (err) {
    console.error("❌ Prisma Client tidak ditemukan! Pastikan Anda sudah menjalankan 'npm install' di folder backend atau START_APP.bat terlebih dahulu.");
    process.exit(1);
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  ⚠️  SMART ATTENDANCE PRO — DATA RESET TOOL             ║');
console.log('║      Menghapus semua data Karyawan & Absen dari Database  ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

(async () => {
  try {
    console.log(`⚠️ PERINGATAN: Semua data di tabel berikut akan DIHAPUS PERMANEN:`);
    console.log(`   - Employee (Karyawan)`);
    console.log(`   - Attendance (Absensi)`);
    console.log(`   - LeaveRequest (Cuti)`);
    console.log(`   - PayrollDetail (Gaji)`);
    console.log(`   - User (Akun login karyawan)`);
    
    const confirm = await ask(`\nKetik "RESET" untuk melanjutkan: `);
    if (confirm !== 'RESET') {
      console.log('❌ Dibatalkan.');
      await prisma.$disconnect();
      process.exit(0);
    }

    console.log('\nSedang menghubungkan ke database & menghapus data...');

    // Hapus data secara sekuensial untuk menghindari konflik foreign key
    await prisma.attendance.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollDetail.deleteMany({});
    await prisma.employeeSalary.deleteMany({});
    await prisma.correctionRequest.deleteMany({});
    
    // Jangan hapus akun Admin (role selain EMPLOYEE)
    await prisma.user.deleteMany({
      where: {
        role: 'EMPLOYEE'
      }
    });
    
    await prisma.employee.deleteMany({});

    console.log('\n✅ Semua data Karyawan dan Absensi berhasil dikosongkan!');
    console.log('💡 Anda sekarang bisa melakukan proses Import Excel ulang yang bersih.\n');

    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    try { await prisma.$disconnect(); } catch (e) {}
    process.exit(1);
  }
})();
