const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Smart Attendance Pro database...\n');

  // SAFETY CHECK: Prevent wiping an already established database
  const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (adminExists) {
    console.log('✅ Database is already initialized. Skipping seed to protect existing data.');
    return;
  }

  console.log('🧹 Cleaning existing data...');
  await prisma.notification.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.correctionRequest.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.employeeSalary.deleteMany({});
  await prisma.payrollDetail.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.location.deleteMany({});
  console.log('🧹 Database cleaned.\n');



  // ─── Users (Admin Only) ────────────────────────
  const hashedPassword = await bcrypt.hash('admin123', 10);

  await prisma.user.create({
    data: { username: 'admin', password: hashedPassword, role: 'SUPER_ADMIN' },
  });
  console.log('✅ Admin user account created');

  // ─── Locations ─────────────────────────────────
  await prisma.location.createMany({
    data: [
      { name: 'Headquarters (HQ)', address: 'Main St. 123, Central City', lat: -6.2088, lng: 106.8456, radius: 100 },
    ],
  });
  console.log('✅ Default office location created');

  // ─── Settings ──────────────────────────────────
  const settingsData = [
    { key: 'companyName', value: 'Smart Attendance Pro Ltd.' },
    { key: 'companyEmail', value: 'admin@smartattendance.pro' },
    { key: 'companyPhone', value: '+62 21 555-0123' },
    { key: 'companyAddress', value: 'Sudirman Central Business District, Tower 5, Level 12, Jakarta, Indonesia' },
    { key: 'companyWebsite', value: 'https://smartattendance.pro' },
    { key: 'strictGeofencing', value: 'true' },
    { key: 'faceMatchThreshold', value: '85' },
    { key: 'livenessDetection', value: 'true' },
    { key: 'autoEnrollment', value: 'false' },
    { key: 'otNotification', value: 'false' },
    { key: 'autoCheckoutTime', value: '23:59' },
    { key: 'saturdayHalfDay', value: 'true' }, // PENGATURAN BARU: Sabtu setengah hari
    { key: 'saturdayCheckoutTime', value: '13:00' } // PENGATURAN BARU: Jam pulang sabtu
  ];

  if (process.env.INITIAL_LICENSE_KEY) {
    settingsData.push({ key: 'licenseKey', value: process.env.INITIAL_LICENSE_KEY });
    console.log('🔑 Auto-injecting License Key from environment...');
  }

  for (const s of settingsData) {
    await prisma.settings.upsert({ where: { key: s.key }, update: { value: s.value }, create: s });
  }
  console.log('✅ Default settings configured');

  console.log('\n🎉 Seeding complete! Login credentials:');
  console.log('   Admin:    username=admin, password=admin123');
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
