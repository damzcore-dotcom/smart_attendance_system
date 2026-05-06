const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Smart Attendance Pro database...\n');

  // ─── Departments ───────────────────────────────
  const departments = await Promise.all(
    ['Engineering', 'Marketing', 'HR', 'Operations'].map(name =>
      prisma.department.upsert({ where: { name }, update: {}, create: { name } })
    )
  );
  console.log(`✅ ${departments.length} departments created`);

  // ─── Shifts ────────────────────────────────────
  const generalShift = await prisma.shift.create({
    data: { name: 'General Shift', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00', gracePeriod: 15 },
  });
  console.log('✅ General Shift created');

  // ─── Employees ─────────────────────────────────
  const employeesData = [
    { employeeCode: 'EMP001', name: 'John Doe', email: 'john@company.com', position: 'Senior Software Engineer', departmentId: departments[0].id, faceStatus: 'ENROLLED' },
    { employeeCode: 'EMP002', name: 'Jane Smith', email: 'jane@company.com', position: 'Marketing Manager', departmentId: departments[1].id, faceStatus: 'ENROLLED' },
    { employeeCode: 'EMP003', name: 'Mike Johnson', email: 'mike@company.com', position: 'DevOps Engineer', departmentId: departments[0].id, status: 'ON_LEAVE', faceStatus: 'ENROLLED' },
    { employeeCode: 'EMP004', name: 'Sarah Wilson', email: 'sarah@company.com', position: 'HR Specialist', departmentId: departments[2].id, faceStatus: 'PENDING' },
    { employeeCode: 'EMP005', name: 'Robert Brown', email: 'robert@company.com', position: 'Operations Lead', departmentId: departments[3].id, faceStatus: 'ENROLLED' },
  ];

  const employees = [];
  for (const data of employeesData) {
    const emp = await prisma.employee.create({
      data: { ...data, shiftId: generalShift.id },
    });
    employees.push(emp);
  }
  console.log(`✅ ${employees.length} employees created`);

  // ─── Users (Admin + Employees) ─────────────────
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const hashedEmpPassword = await bcrypt.hash('password', 10);

  await prisma.user.create({
    data: { username: 'admin', password: hashedPassword, role: 'SUPER_ADMIN' },
  });

  for (const emp of employees) {
    await prisma.user.create({
      data: {
        username: emp.email.split('@')[0],
        password: hashedEmpPassword,
        role: 'EMPLOYEE',
        employeeId: emp.id,
      },
    });
  }
  console.log('✅ Admin + employee user accounts created');

  // ─── Locations ─────────────────────────────────
  await prisma.location.createMany({
    data: [
      { name: 'Headquarters (HQ)', address: 'Main St. 123, Central City', lat: -6.2088, lng: 106.8456, radius: 100 },
      { name: 'Warehouse A', address: 'Industrial Park Road 45', lat: -6.3541, lng: 106.9213, radius: 250 },
    ],
  });
  console.log('✅ 2 office locations created');

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
  ];

  for (const s of settingsData) {
    await prisma.settings.upsert({ where: { key: s.key }, update: { value: s.value }, create: s });
  }
  console.log('✅ Default settings configured');

  // ─── Sample Attendance Records ─────────────────
  const today = new Date();
  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    for (const emp of employees.filter(e => e.status !== 'ON_LEAVE')) {
      const isLate = Math.random() < 0.2; // 20% chance of being late
      const checkInHour = isLate ? 8 : 7 + Math.floor(Math.random() * 1);
      const checkInMin = isLate ? 15 + Math.floor(Math.random() * 30) : Math.floor(Math.random() * 60);

      const checkIn = new Date(dayDate);
      checkIn.setHours(checkInHour, checkInMin, 0);

      const checkOut = new Date(dayDate);
      checkOut.setHours(17, Math.floor(Math.random() * 30), 0);

      const lateMinutes = isLate ? checkInMin - 0 + (checkInHour - 8) * 60 : 0;

      await prisma.attendance.create({
        data: {
          employeeId: emp.id,
          date: dayDate,
          checkIn,
          checkOut: dayOffset === 0 ? null : checkOut, // Today: no checkout yet
          status: isLate ? 'LATE' : 'PRESENT',
          lateMinutes: isLate ? lateMinutes : 0,
          mode: Math.random() > 0.3 ? 'Face ID' : 'Credentials',
        },
      });
    }
  }
  console.log('✅ Sample attendance records created (5 days)');

  // ─── Sample Notifications ──────────────────────
  await prisma.notification.createMany({
    data: [
      { employeeId: employees[0].id, title: 'Welcome!', message: 'Your Smart Attendance Pro account is ready.', isRead: true },
      { employeeId: employees[0].id, title: 'Shift Updated', message: 'Your shift has been set to General Shift (08:00-17:00).', isRead: false },
      { employeeId: employees[0].id, title: 'Late Check-in', message: 'You were 15 minutes late on Monday.', isRead: false },
    ],
  });
  console.log('✅ Sample notifications created');

  console.log('\n🎉 Seeding complete! Login credentials:');
  console.log('   Admin:    username=admin, password=admin123');
  console.log('   Employee: username=john, password=password');
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
