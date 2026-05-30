const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const prisma = require('../src/prismaClient');

async function main() {
  console.log("=== MEMULAI PENCARIAN KARYAWAN SEMENTARA ===");
  
  const employees = await prisma.employee.findMany({
    where: {
      OR: [
        { email: { endsWith: '@system.local' } },
        { name: { startsWith: 'User Mesin' } }
      ]
    },
    include: {
      department: true
    }
  });

  console.log(`Ditemukan ${employees.length} karyawan sementara:\n`);
  
  employees.forEach((emp, index) => {
    console.log(`${index + 1}. Nama: "${emp.name}"`);
    console.log(`   ID Database: ${emp.id}`);
    console.log(`   NIK / Employee Code: "${emp.employeeCode}"`);
    console.log(`   Fingerprint ID: "${emp.fingerPrintId || 'TIDAK ADA'}"`);
    console.log(`   Email: "${emp.email || 'KOSONG'}"`);
    console.log(`   Departemen: "${emp.department?.name || 'KOSONG'}"`);
    console.log(`   -------------------------------------------------`);
  });
}

main().catch(err => console.error(err)).finally(() => prisma.$disconnect());
