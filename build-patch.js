const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const rootDir = __dirname;
const patchDir = path.join(rootDir, 'PATCH_TEMP');
const patchZipPath = path.join(rootDir, 'Patch_Update.zip');

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  📦  SMART ATTENDANCE PRO — PATCH BUILDER               ║');
console.log('║      Membuat file ZIP ringan untuk update ke client       ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

(async () => {
  try {
    // 1. BUILD FRONTEND & BACKEND
    console.log('── [1/4] Building Frontend ─────────────────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });

    console.log('\n── [2/4] Building Backend (Obfuscation) ────────────────');
    execSync('npm run build', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });

    // 2. PREPARE TEMP FOLDER
    console.log('\n── [3/4] Menyiapkan File Patch ─────────────────────────');
    if (fs.existsSync(patchDir)) fs.rmSync(patchDir, { recursive: true, force: true });
    fs.mkdirSync(patchDir);
    fs.mkdirSync(path.join(patchDir, 'backend'));
    fs.mkdirSync(path.join(patchDir, 'frontend'));

    // Copy only compiled files and schema (no node_modules, no raw src)
    fs.cpSync(path.join(rootDir, 'backend', 'dist'), path.join(patchDir, 'backend', 'dist'), { recursive: true });
    fs.cpSync(path.join(rootDir, 'backend', 'prisma'), path.join(patchDir, 'backend', 'prisma'), { recursive: true });
    fs.cpSync(path.join(rootDir, 'backend', 'package.json'), path.join(patchDir, 'backend', 'package.json'));
    
    fs.cpSync(path.join(rootDir, 'frontend', 'dist'), path.join(patchDir, 'frontend', 'dist'), { recursive: true });

    if (fs.existsSync(path.join(rootDir, 'reset-client-data.js'))) {
      fs.cpSync(path.join(rootDir, 'reset-client-data.js'), path.join(patchDir, 'reset-client-data.js'));
    }

    // 3. ZIP THE PATCH
    console.log('\n── [4/4] Membuat File ZIP (Patch_Update.zip) ───────────');
    const output = fs.createWriteStream(patchZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      // CLEANUP TEMP FOLDER
      if (fs.existsSync(patchDir)) fs.rmSync(patchDir, { recursive: true, force: true });
      
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`\n✅ Patch Berhasil Dibuat!`);
      console.log(`   File : Patch_Update.zip`);
      console.log(`   Size : ${sizeMB} MB`);
      console.log(`\n💡 CARA UPDATE KE CLIENT:`);
      console.log(`   1. Kirim file Patch_Update.zip ke komputer client.`);
      console.log(`   2. Matikan aplikasi di komputer client.`);
      console.log(`   3. Ekstrak ZIP tersebut, dan copy-paste menimpa folder instalasi lama.`);
      console.log(`   4. Jalankan aplikasi seperti biasa. Update selesai!\n`);
    });

    archive.on('error', (err) => { throw err; });
    archive.pipe(output);
    archive.directory(patchDir, false);
    archive.finalize();

  } catch (err) {
    console.error('\n❌ BUILD PATCH GAGAL:', err.message);
    if (fs.existsSync(patchDir)) fs.rmSync(patchDir, { recursive: true, force: true });
  }
})();
