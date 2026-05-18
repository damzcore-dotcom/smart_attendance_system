require('dotenv').config({ path: './backend/.env' });
const { Client } = require('pg');
const readline = require('readline');

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
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.log('⚠️ File .env tidak ditemukan atau DATABASE_URL kosong.');
      dbUrl = await ask('Masukkan DATABASE_URL (contoh: postgresql://postgres:root@localhost:5432/smart_attendance): ');
    }

    if (!dbUrl) {
      console.log('❌ DATABASE_URL wajib diisi!');
      process.exit(1);
    }

    console.log(`\nMenghubungkan ke database...`);
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    console.log(`✅ Terhubung ke database.\n`);
    console.log(`⚠️ PERINGATAN: Semua data di tabel berikut akan DIHAPUS PERMANEN:`);
    console.log(`   - Employee (Karyawan)`);
    console.log(`   - Attendance (Absensi)`);
    console.log(`   - LeaveRequest (Cuti)`);
    console.log(`   - PayrollDetail (Gaji)`);
    console.log(`   - User (Akun login karyawan)`);
    
    const confirm = await ask(`\nKetik "RESET" untuk melanjutkan: `);
    if (confirm !== 'RESET') {
      console.log('❌ Dibatalkan.');
      await client.end();
      process.exit(0);
    }

    console.log('\nSedang menghapus data...');
    
    // Menghapus data dengan urutan yang benar karena ada relasi Foreign Key (CASCADE)
    // Cukup delete Employee, maka Attendance dan lainnya akan terhapus otomatis 
    // jika Prisma Schema diset Cascade. Namun untuk aman, kita hapus manual.
    await client.query('DELETE FROM "Attendance"');
    await client.query('DELETE FROM "LeaveRequest"');
    await client.query('DELETE FROM "PayrollDetail"');
    await client.query('DELETE FROM "EmployeeSalary"');
    await client.query('DELETE FROM "CorrectionRequest"');
    
    // Jangan hapus akun Admin (role SUPER_ADMIN/ADMIN/ACCOUNTING)
    await client.query(`DELETE FROM "User" WHERE role = 'EMPLOYEE'`);
    
    await client.query('DELETE FROM "Employee"');

    console.log('✅ Semua data Karyawan dan Absensi berhasil dikosongkan!');
    console.log('💡 Anda sekarang bisa melakukan proses Import Excel ulang yang bersih.\n');

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  }
})();
