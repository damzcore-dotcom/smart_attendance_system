const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) => new Promise(resolve => rl.question(question, resolve));

const generateSecret = (length = 64) => crypto.randomBytes(length).toString('hex');

console.log('');
console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║   🏢  SMART ATTENDANCE PRO — CLIENT SETUP WIZARD    ║');
console.log('║       Automated Deployment Configuration Tool        ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('');

(async () => {
  try {
    // ─── Step 1: Client Info ───
    console.log('── STEP 1: Informasi Klien ──────────────────────────────');
    const clientName = await ask('   Nama perusahaan klien : ');
    if (!clientName.trim()) { console.error('❌ Nama perusahaan wajib diisi!'); process.exit(1); }

    // ─── Step 2: Database ───
    console.log('\n── STEP 2: Konfigurasi Database ─────────────────────────');
    const dbHost = await ask('   Database host [localhost]  : ') || 'localhost';
    const dbPort = await ask('   Database port [5432]       : ') || '5432';
    const dbUser = await ask('   Database user [postgres]   : ') || 'postgres';
    const dbPass = await ask('   Database password          : ');
    const dbName = await ask('   Database name [smart_attendance] : ') || 'smart_attendance';

    if (!dbPass.trim()) { console.error('❌ Password database wajib diisi!'); process.exit(1); }

    const databaseUrl = `postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;

    // ─── Step 3: Server ───
    console.log('\n── STEP 3: Konfigurasi Server ───────────────────────────');
    const serverPort = await ask('   Backend port [5000]        : ') || '5000';
    const corsOrigins = await ask('   Frontend URL(s) [http://localhost:5173] : ') || 'http://localhost:5173';
    console.log('   (Pisahkan dengan koma jika lebih dari satu, contoh: http://192.168.1.10:5173,https://app.client.com)');
    
    const frontendPort = await ask('   Frontend port [5173]       : ') || '5173';
    const apiUrl = await ask(`   Backend API URL [http://localhost:${serverPort}] : `) || `http://localhost:${serverPort}`;

    // ─── Step 4: License ───
    console.log('\n── STEP 4: Konfigurasi Lisensi ─────────────────────────');
    const maxEmployees = await ask('   Maksimal karyawan [100]    : ') || '100';
    const licenseExpiry = await ask('   Tanggal expired [2027-12-31] : ') || '2027-12-31';

    // ─── Generate Secrets ───
    console.log('\n⏳ Generating unique security keys...');
    const jwtSecret = generateSecret(48);
    const jwtRefreshSecret = generateSecret(48);
    // Master License Secret — TETAP SAMA untuk semua klien
    // Ini adalah "cetakan kunci" milik Anda. Jangan pernah bagikan!
    const licenseSecret = 'd94795ad7e96949a882a1f45a4206a69184172efc14f226f4c49def1bf9bdfc1';

    // Auto-generate license key based on wizard inputs
    const payload = { client: clientName, expiry: licenseExpiry, limit: parseInt(maxEmployees) };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const hmac = crypto.createHmac('sha256', licenseSecret);
    hmac.update(payloadB64);
    const signature = hmac.digest('hex');
    const autoLicenseKey = `${payloadB64}.${signature}`;

    // ─── Write backend/.env ───
    const envPath = path.join(__dirname, 'backend', '.env');
    const envContent = [
      `# ═══════════════════════════════════════════════════`,
      `# Smart Attendance Pro — Environment Configuration`,
      `# Client: ${clientName}`,
      `# Generated: ${new Date().toISOString()}`,
      `# ═══════════════════════════════════════════════════`,
      ``,
      `# Database`,
      `DATABASE_URL="${databaseUrl}"`,
      ``,
      `# Server`,
      `PORT=${serverPort}`,
      `CORS_ORIGINS="${corsOrigins}"`,
      ``,
      `# JWT Authentication (auto-generated — DO NOT SHARE)`,
      `JWT_SECRET="${jwtSecret}"`,
      `JWT_REFRESH_SECRET="${jwtRefreshSecret}"`,
      ``,
      `# License System (auto-generated — DO NOT SHARE)`,
      `LICENSE_SECRET="${licenseSecret}"`,
      `INITIAL_LICENSE_KEY="${autoLicenseKey}"`,
      ``
    ].join('\n');

    fs.writeFileSync(envPath, envContent);

    // ─── Write frontend/.env ───
    const frontendEnvPath = path.join(__dirname, 'frontend', '.env');
    const frontendEnvContent = [
      `# ═══════════════════════════════════════════════════`,
      `# Smart Attendance Pro — Frontend Configuration`,
      `# Client: ${clientName}`,
      `# Generated: ${new Date().toISOString()}`,
      `# ═══════════════════════════════════════════════════`,
      ``,
      `VITE_PORT=${frontendPort}`,
      `VITE_API_URL=${apiUrl}`,
      ``
    ].join('\n');

    fs.writeFileSync(frontendEnvPath, frontendEnvContent);

    // ─── Write license info ───
    const licensePath = path.join(__dirname, `LICENSE_KEY_${clientName.replace(/\s+/g, '_').toUpperCase()}.txt`);
    const licenseContent = [
      `═══════════════════════════════════════════════════`,
      `SMART ATTENDANCE PRO — LICENSE KEY`,
      `═══════════════════════════════════════════════════`,
      `Client        : ${clientName}`,
      `Max Employees : ${maxEmployees}`,
      `Expiry Date   : ${licenseExpiry}`,
      `Generated     : ${new Date().toISOString()}`,
      `═══════════════════════════════════════════════════`,
      ``,
      `LICENSE KEY:`,
      autoLicenseKey,
      ``,
      `═══════════════════════════════════════════════════`,
      `Masukkan key di atas ke menu Settings → License`,
      `pada aplikasi Smart Attendance Pro.`,
      `═══════════════════════════════════════════════════`,
      ``
    ].join('\n');

    fs.writeFileSync(licensePath, licenseContent);

    // ─── Summary ───
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║            ✅  SETUP BERHASIL!                       ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║  Client      : ${clientName.padEnd(39)}║`);
    console.log(`║  Database    : ${dbHost}:${dbPort}/${dbName}`.padEnd(56) + '║');
    console.log(`║  Backend Port: ${serverPort.padEnd(39)}║`);
    console.log(`║  Frontnd Port: ${frontendPort.padEnd(39)}║`);
    console.log(`║  API URL     : ${apiUrl.substring(0, 39).padEnd(39)}║`);
    console.log(`║  CORS        : ${corsOrigins.substring(0, 39).padEnd(39)}║`);
    console.log(`║  Max Employees: ${maxEmployees.padEnd(38)}║`);
    console.log(`║  License Exp : ${licenseExpiry.padEnd(39)}║`);
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log('║  Files generated:                                    ║');
    console.log('║  📄 backend/.env           (server configuration)    ║');
    console.log('║  📄 frontend/.env          (client configuration)    ║');
    console.log(`║  🔑 LICENSE_KEY_*.txt       (license key for client)  ║`);
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log('║  NEXT STEPS (gunakan CMD, bukan PowerShell):        ║');
    console.log('║                                                      ║');
    console.log('║  Backend:                                            ║');
    console.log('║  1. cd backend                                      ║');
    console.log('║  2. npm install                                     ║');
    console.log('║  3. npx prisma db push                              ║');
    console.log('║  4. node prisma/seed.js (jika database baru)        ║');
    console.log('║                                                      ║');
    console.log('║  Frontend (buka CMD baru):                           ║');
    console.log('║  5. cd frontend                                     ║');
    console.log('║  6. npm install                                     ║');
    console.log('║                                                      ║');
    console.log('║  Jalankan sistem:                                    ║');
    console.log('║  7. Klik START_SYSTEM.bat                            ║');
    console.log('║  8. Buka http://localhost:5173                       ║');
    console.log('║  9. Login: admin / admin123                          ║');
    console.log('║ 10. Settings → masukkan License Key                  ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');
    console.log('⚠️  PENTING: Jangan bagikan file .env ke siapapun!');
    console.log('    Setiap klien memiliki secret unik yang berbeda.');
    console.log('    Gunakan CMD (Command Prompt), bukan PowerShell.\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    rl.close();
  }
})();
