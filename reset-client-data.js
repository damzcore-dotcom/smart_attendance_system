const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Manual env parser to avoid requiring 'dotenv' module on client root
let dbUrl = '';
try {
  const envPath = path.join(__dirname, 'backend', '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    const match = envFile.match(/DATABASE_URL="?([^"\n]+)"?/);
    if (match && match[1]) dbUrl = match[1];
  }
} catch (e) {}

// Safe load pg from backend node_modules
let Client;
try {
  Client = require(path.join(__dirname, 'backend', 'node_modules', 'pg')).Client;
} catch (e) {
  try {
    Client = require('pg').Client;
  } catch (err) {
    console.error("❌ Pustaka 'pg' tidak ditemukan! Pastikan Anda sudah menjalankan 'npm install' di folder backend atau START_SYSTEM.bat terlebih dahulu.");
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
    let connectionString = dbUrl || process.env.DATABASE_URL;
    if (!connectionString) {
      console.log('⚠️ File .env tidak ditemukan atau DATABASE_URL kosong.');
      connectionString = await ask('Masukkan DATABASE_URL (contoh: postgresql://postgres:root@localhost:5432/smart_attendance): ');
    }

    if (!connectionString) {
      console.log('❌ DATABASE_URL wajib diisi!');
      process.exit(1);
    }

    console.log(`\nMenghubungkan ke database...`);
    const client = new Client({ connectionString });
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
