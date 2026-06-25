/**
 * Bersihkan & deteksi duplikasi ID Sidik Jari (No. AC) pada data karyawan.
 *
 * Yang dilakukan:
 *  1. Normalisasi: trim spasi, dan ubah string kosong ("") → NULL.
 *  2. Laporkan duplikat: No. AC yang sama dipakai oleh >1 karyawan (perlu diperbaiki manual).
 *
 * Tujuan: setelah data bersih (tanpa duplikat), Anda boleh menambahkan
 *   fingerPrintId String? @unique
 * di prisma/schema.prisma lalu menjalankan `npx prisma migrate dev` untuk
 * mengunci keunikan No. AC di level database (hardening tambahan).
 *
 * Jalankan dari folder backend:  node dedupe-fingerprints.js
 */
const prisma = require('./src/prismaClient');

(async () => {
  try {
    const all = await prisma.employee.findMany({
      select: { id: true, name: true, employeeCode: true, fingerPrintId: true },
    });

    // 1) Normalisasi kosong/spasi → null
    let normalized = 0;
    for (const e of all) {
      const trimmed = e.fingerPrintId ? String(e.fingerPrintId).trim() : '';
      const target = trimmed === '' ? null : trimmed;
      if (e.fingerPrintId !== target) {
        await prisma.employee.update({ where: { id: e.id }, data: { fingerPrintId: target } });
        normalized++;
      }
    }

    // 2) Deteksi duplikat No. AC (non-null)
    const fresh = await prisma.employee.findMany({
      select: { id: true, name: true, employeeCode: true, fingerPrintId: true },
    });
    const map = new Map();
    for (const e of fresh) {
      if (!e.fingerPrintId) continue;
      if (!map.has(e.fingerPrintId)) map.set(e.fingerPrintId, []);
      map.get(e.fingerPrintId).push(e);
    }
    const dups = [...map.entries()].filter(([, list]) => list.length > 1);

    console.log(`\nNormalisasi : ${normalized} record dirapikan (kosong/spasi → NULL).`);
    console.log(`Duplikat    : ${dups.length} grup No. AC ganda.\n`);
    for (const [ac, list] of dups) {
      console.log(`  No. AC ${ac}:`);
      list.forEach(x => console.log(`     - ${x.name} (NIK ${x.employeeCode}, id ${x.id})`));
    }

    if (dups.length === 0) {
      console.log('\n✅ Tidak ada duplikat. Aman menambahkan @unique pada fingerPrintId.');
    } else {
      console.log('\n⚠️  Perbaiki duplikat di atas (kosongkan/ubah salah satu) sebelum menambahkan @unique.');
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
