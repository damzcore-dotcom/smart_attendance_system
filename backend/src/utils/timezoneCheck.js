/**
 * Utility to check if server timezone matches Asia/Jakarta
 */
function checkTimezone() {
  const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const expectedTz = 'Asia/Jakarta';
  const isMatch = currentTz === expectedTz;

  if (!isMatch) {
    console.warn('\n' + '='.repeat(80));
    console.warn('⚠️  WARNING: SERVER TIMEZONE MISMATCH DETECTED!');
    console.warn(`Expected Timezone : ${expectedTz}`);
    console.warn(`Current Timezone  : ${currentTz}`);
    console.warn('='.repeat(80));
    console.warn('Jika timezone tidak sesuai, waktu absensi dan status keterlambatan');
    console.warn('dapat dihitung dengan salah.');
    console.warn('\nInstruksi untuk mengubah timezone:');
    console.warn('\n1. Windows:');
    console.warn('   Buka Command Prompt (Run as Administrator) lalu jalankan:');
    console.warn('   tzutil /s "SE Asia Standard Time"');
    console.warn('\n2. Linux (Ubuntu/Debian):');
    console.warn('   Jalankan command berikut di terminal:');
    console.warn('   sudo timedatectl set-timezone Asia/Jakarta');
    console.warn('\n3. Docker (docker-compose.yml):');
    console.warn('   Tambahkan environment variable TZ pada service api/backend Anda:');
    console.warn('   environment:');
    console.warn('     - TZ=Asia/Jakarta');
    console.warn('='.repeat(80) + '\n');
  }

  return {
    isMatch,
    current: currentTz,
    expected: expectedTz,
    instructions: {
      windows: 'tzutil /s "SE Asia Standard Time"',
      linux: 'sudo timedatectl set-timezone Asia/Jakarta',
      docker: 'environment:\n  - TZ=Asia/Jakarta'
    }
  };
}

module.exports = checkTimezone;
