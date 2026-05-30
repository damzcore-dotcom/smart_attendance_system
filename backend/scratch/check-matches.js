const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/prismaClient');

async function main() {
  const temps = await prisma.employee.findMany({
    where: {
      OR: [
        { email: { endsWith: '@system.local' } },
        { name: { startsWith: 'User Mesin' } }
      ]
    }
  });

  const reals = await prisma.employee.findMany({
    where: {
      NOT: [
        { email: { endsWith: '@system.local' } },
        { name: { startsWith: 'User Mesin' } }
      ]
    }
  });

  console.log(`Jumlah Karyawan Sementara: ${temps.length}`);
  console.log(`Jumlah Karyawan Riil: ${reals.length}`);

  let matches = [];
  let noMatches = [];

  temps.forEach(temp => {
    const tempNameNorm = temp.name.toLowerCase().trim();
    const match = reals.find(r => r.name.toLowerCase().trim() === tempNameNorm);
    if (match) {
      matches.push({ temp, real: match });
    } else {
      noMatches.push(temp);
    }
  });

  console.log(`\nKecocokan Nama Sempurna Ditemukan: ${matches.length}`);
  matches.forEach((m, idx) => {
    console.log(`${idx + 1}. "${m.temp.name}" -> Cocok dengan NIK Asli: ${m.real.employeeCode}`);
  });

  console.log(`\nBelum Ada Kecocokan: ${noMatches.length}`);
  noMatches.forEach((nm, idx) => {
    console.log(`${idx + 1}. "${nm.name}" (FP ID: ${nm.fingerPrintId})`);
  });
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
