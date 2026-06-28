const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Smart Attendance Pro DEMO database...\n');

  console.log('🧹 Cleaning existing data...');
  await prisma.auditLog.deleteMany({});
  await prisma.reimbursementClaim.deleteMany({});
  await prisma.profileUpdateRequest.deleteMany({});
  await prisma.employeeKPI.deleteMany({});
  await prisma.pushToken.deleteMany({});
  await prisma.deviceUser.deleteMany({});
  await prisma.fingerTemplate.deleteMany({});
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
  await prisma.announcement.deleteMany({});
  await prisma.massLeave.deleteMany({});
  await prisma.overtimeRule.deleteMany({});
  await prisma.salaryComponent.deleteMany({});
  await prisma.payrollConfig.deleteMany({});
  console.log('🧹 Database cleaned.\n');

  // ─── Create Locations ─────────────────────────────────
  const hq = await prisma.location.create({
    data: { name: 'Headquarters (HQ)', address: 'Jl. Sudirman No. 45, Jakarta Pusat', lat: -6.2088, lng: 106.8456, radius: 150 }
  });
  const branch = await prisma.location.create({
    data: { name: 'Pabrik Bandung', address: 'Jl. Industri Utama No. 12, Bandung', lat: -6.9175, lng: 107.6191, radius: 200 }
  });
  console.log('✅ Office locations created');

  // ─── Create Departments ──────────────────────────────
  const deptOffice = await prisma.department.create({ data: { name: 'Office & HRD' } });
  const deptProduksi = await prisma.department.create({ data: { name: 'Produksi / Sewing' } });
  const deptWarehouse = await prisma.department.create({ data: { name: 'Warehouse / Gudang' } });
  console.log('✅ Departments created');

  // ─── Create Shifts ───────────────────────────────────
  const shiftPagi = await prisma.shift.create({
    data: {
      name: 'Shift Pagi',
      startTime: '08:00',
      endTime: '17:00',
      breakStart: '12:00',
      breakEnd: '13:00',
      gracePeriod: 15,
      saturdayType: 'HALF_DAY',
      saturdayEndTime: '13:00'
    }
  });

  const shiftSiang = await prisma.shift.create({
    data: {
      name: 'Shift Siang',
      startTime: '14:00',
      endTime: '22:00',
      breakStart: '18:00',
      breakEnd: '19:00',
      gracePeriod: 15,
      saturdayType: 'OFF',
      saturdayEndTime: null
    }
  });
  console.log('✅ Shifts created');

  // ─── Create Settings ─────────────────────────────────
  const settingsData = [
    { key: 'companyName', value: 'PT. Demo Sejahtera' },
    { key: 'companyEmail', value: 'info@demosejahtera.co.id' },
    { key: 'companyPhone', value: '021-5550065' },
    { key: 'companyAddress', value: 'Gedung Demo Suite Lt. 5, Sudirman, Jakarta' },
    { key: 'companyWebsite', value: 'https://smartattendance.co.id' },
    { key: 'strictGeofencing', value: 'true' },
    { key: 'faceMatchThreshold', value: '85' },
    { key: 'livenessDetection', value: 'true' },
    { key: 'autoEnrollment', value: 'false' },
    { key: 'otNotification', value: 'false' },
    { key: 'autoCheckoutTime', value: '23:59' },
    { key: 'saturdayHalfDay', value: 'true' },
    { key: 'saturdayCheckoutTime', value: '13:00' },
    { key: 'demoMode', value: 'true' }
  ];

  // Auto 30-day trial license
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);
  const licensePayload = {
    companyName: 'PT. Demo Sejahtera',
    expiry: expiryDate.toISOString(),
    features: ['all']
  };
  const licenseB64 = Buffer.from(JSON.stringify(licensePayload)).toString('base64');
  const signature = 'demosignaturesmartattendancepro2026';
  const licenseKey = `${licenseB64}.${signature}`;
  settingsData.push({ key: 'licenseKey', value: licenseKey });

  for (const s of settingsData) {
    await prisma.settings.upsert({ where: { key: s.key }, update: { value: s.value }, create: s });
  }
  console.log('✅ Demo settings configured (30-day auto-expiry)');

  // ─── Create Salary Components ────────────────────────
  const compMakan = await prisma.salaryComponent.create({
    data: { name: 'Tunjangan Uang Makan', type: 'ALLOWANCE', isFixed: true, defaultValue: 25000, calculationType: 'PER_ATTENDANCE' }
  });
  const compTrans = await prisma.salaryComponent.create({
    data: { name: 'Tunjangan Transport', type: 'ALLOWANCE', isFixed: true, defaultValue: 20000, calculationType: 'PER_ATTENDANCE' }
  });
  const compJabatan = await prisma.salaryComponent.create({
    data: { name: 'Tunjangan Jabatan', type: 'ALLOWANCE', isFixed: true, defaultValue: 500000, calculationType: 'FIXED_MONTHLY' }
  });
  console.log('✅ Salary components created');

  // ─── Create Employees & Salaries ──────────────────────
  const names = [
    // Office & HRD (12)
    { name: 'Budi Santoso', pos: 'HR Manager', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 12000000, empType: 'TETAP' },
    { name: 'Siti Aminah', pos: 'HR Staff', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 6000000, empType: 'KONTRAK' },
    { name: 'Dewi Lestari', pos: 'Finance Supervisor', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 9500000, empType: 'TETAP' },
    { name: 'Rian Hidayat', pos: 'Accounting Staff', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 6200000, empType: 'KONTRAK' },
    { name: 'Agus Setiawan', pos: 'IT Support', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 5500000, empType: 'KONTRAK' },
    { name: 'Sari Indah', pos: 'General Affairs', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 5000000, empType: 'KONTRAK' },
    { name: 'Hendra Wijaya', pos: 'Director', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 25000000, empType: 'TETAP' },
    { name: 'Mega Utami', pos: 'Secretary', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 7000000, empType: 'TETAP' },
    { name: 'Adi Nugroho', pos: 'Procurement Specialist', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 6500000, empType: 'TETAP' },
    { name: 'Putri Rahayu', pos: 'Receptionist', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 4800000, empType: 'KONTRAK', status: 'ON_LEAVE' },
    { name: 'Dedi Kusuma', pos: 'Security Officer', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 4600000, empType: 'TETAP' },
    { name: 'Lina Marlina', pos: 'Office Cleaner', dept: deptOffice, shift: shiftPagi, loc: hq, sal: 4500000, empType: 'KONTRAK' },

    // Produksi / Sewing (28)
    { name: 'Rudi Hermawan', pos: 'Production Manager', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 11000000, empType: 'TETAP' },
    { name: 'Anita Sari', pos: 'Sewing Supervisor', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 7000000, empType: 'TETAP' },
    { name: 'Eko Prasetyo', pos: 'Quality Control Lead', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 6800000, empType: 'TETAP' },
    { name: 'Maya Kartika', pos: 'Pattern Maker', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 5800000, empType: 'KONTRAK' },
    { name: 'Toni Haryanto', pos: 'Sewing Operator 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Fitri Handayani', pos: 'Sewing Operator 2', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Bambang Pamungkas', pos: 'Sewing Operator 3', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Yanti Susanti', pos: 'Sewing Operator 4', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Edi Santoso', pos: 'Sewing Operator 5', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Sri Wahyuni', pos: 'Sewing Operator 6', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Dian Sastro', pos: 'Sewing Operator 7', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4600000, empType: 'KONTRAK', status: 'ON_LEAVE' },
    { name: 'Gani Siregar', pos: 'Sewing Operator 8', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Hani Fatimah', pos: 'Sewing Operator 9', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Iwan Fals', pos: 'Cutting Operator 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4650000, empType: 'TETAP' },
    { name: 'Joni Iskandar', pos: 'Cutting Operator 2', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4650000, empType: 'KONTRAK' },
    { name: 'Kiki Amelia', pos: 'Finishing Staff 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4550000, empType: 'KONTRAK' },
    { name: 'Lutfi Alamsyah', pos: 'Finishing Staff 2', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4550000, empType: 'KONTRAK' },
    { name: 'Nana Suryana', pos: 'Ironing Staff 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4500000, empType: 'KONTRAK' },
    { name: 'Oki Setiana', pos: 'Ironing Staff 2', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4500000, empType: 'KONTRAK' },
    { name: 'Panji Trihatmojo', pos: 'Packaging Operator 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4500000, empType: 'KONTRAK' },
    { name: 'Rina Nose', pos: 'Packaging Operator 2', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4500000, empType: 'KONTRAK' },
    { name: 'Soleh Solihun', pos: 'Maintenance Staff 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4700000, empType: 'TETAP' },
    { name: 'Titin Sumarni', pos: 'Maintenance Staff 2', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4700000, empType: 'KONTRAK', status: 'TERMINATED' },
    { name: 'Ujang Sukandar', pos: 'QC Operator 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Vivi Novika', pos: 'QC Operator 2', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4600000, empType: 'KONTRAK' },
    { name: 'Wawan Kurniawan', pos: 'Helper Produksi 1', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4500000, empType: 'HARIAN' },
    { name: 'Yuda Pratama', pos: 'Helper Produksi 2', dept: deptProduksi, shift: shiftSiang, loc: branch, sal: 4500000, empType: 'HARIAN' },
    { name: 'Zack Lee', pos: 'Security Pabrik', dept: deptProduksi, shift: shiftPagi, loc: branch, sal: 4600000, empType: 'KONTRAK' },

    // Warehouse / Gudang (10)
    { name: 'Aria Wiraguna', pos: 'Warehouse Manager', dept: deptWarehouse, shift: shiftPagi, loc: branch, sal: 10500000, empType: 'TETAP' },
    { name: 'Citra Kirana', pos: 'Inventory Controller', dept: deptWarehouse, shift: shiftPagi, loc: branch, sal: 6000000, empType: 'TETAP' },
    { name: 'Ferry Salim', pos: 'Warehouse Supervisor', dept: deptWarehouse, shift: shiftPagi, loc: branch, sal: 7500000, empType: 'TETAP' },
    { name: 'Gisella Anastasia', pos: 'Admin Gudang', dept: deptWarehouse, shift: shiftPagi, loc: branch, sal: 4800000, empType: 'KONTRAK' },
    { name: 'Hengky Kurniawan', pos: 'Loader / Stacker 1', dept: deptWarehouse, shift: shiftPagi, loc: branch, sal: 4550000, empType: 'KONTRAK' },
    { name: 'Indra Bekti', pos: 'Loader / Stacker 2', dept: deptWarehouse, shift: shiftSiang, loc: branch, sal: 4550000, empType: 'KONTRAK' },
    { name: 'Julia Perez', pos: 'Loader / Stacker 3', dept: deptWarehouse, shift: shiftPagi, loc: branch, sal: 4550000, empType: 'KONTRAK', status: 'ON_LEAVE' },
    { name: 'Luna Maya', pos: 'Loader / Stacker 4', dept: deptWarehouse, shift: shiftSiang, loc: branch, sal: 4550000, empType: 'KONTRAK', status: 'TERMINATED' },
    { name: 'Nikita Willy', pos: 'Forklift Driver 1', dept: deptWarehouse, shift: shiftPagi, loc: branch, sal: 4750000, empType: 'KONTRAK' },
    { name: 'Roy Marten', pos: 'Forklift Driver 2', dept: deptWarehouse, shift: shiftSiang, loc: branch, sal: 4750000, empType: 'KONTRAK' }
  ];

  const employees = [];
  let codeCount = 1001;

  for (const n of names) {
    const code = `EMP${codeCount++}`;
    const cleanName = n.name.replace(/\s+/g, '').toLowerCase();
    const email = `${cleanName}@demosejahtera.co.id`;
    const phone = `0812${Math.floor(10000000 + Math.random() * 90000000)}`;

    const emp = await prisma.employee.create({
      data: {
        employeeCode: code,
        name: n.name,
        email: email,
        phone: phone,
        position: n.pos,
        division: n.dept.name,
        locationId: String(n.loc.id),
        status: n.status || 'ACTIVE',
        joinDate: new Date('2025-01-15'),
        salaryCategory: n.empType === 'HARIAN' ? 'Harian' : 'UMK/UMR',
        departmentId: n.dept.id,
        shiftId: n.shift.id,
        gender: Math.random() > 0.5 ? 'L' : 'P'
      }
    });

    // Create Employee Salary record
    const compList = [
      { componentId: compMakan.id, name: compMakan.name, type: 'ALLOWANCE', value: compMakan.defaultValue },
      { componentId: compTrans.id, name: compTrans.name, type: 'ALLOWANCE', value: compTrans.defaultValue }
    ];
    if (n.pos.includes('Manager') || n.pos.includes('Supervisor') || n.pos.includes('Lead') || n.pos.includes('Director')) {
      compList.push({ componentId: compJabatan.id, name: compJabatan.name, type: 'ALLOWANCE', value: compJabatan.defaultValue });
    }

    await prisma.employeeSalary.create({
      data: {
        employeeId: emp.id,
        employmentType: n.empType,
        salaryType: n.empType === 'HARIAN' ? 'DAILY' : 'MONTHLY',
        baseSalary: n.sal,
        components: compList,
        dailyRate: n.empType === 'HARIAN' ? 180000 : null
      }
    });

    employees.push(emp);
  }
  console.log(`✅ ${employees.length} Employees and their Salary configs created`);

  // ─── Create Login Accounts (Users) ───────────────────
  const passwords = {
    admin: 'admin123',
    hrd: 'hrd123',
    acc: 'acc123',
    manager: 'mgr123',
    karyawan: 'emp123'
  };

  // 1. Super Admin (Budi Santoso - HR Manager)
  const budi = employees.find(e => e.name === 'Budi Santoso');
  await prisma.user.create({
    data: {
      username: 'admin',
      password: await bcrypt.hash(passwords.admin, 10),
      role: 'SUPER_ADMIN',
      employeeId: budi.id,
      mustChangePassword: false
    }
  });

  // 2. HR Admin (Siti Aminah - HR Staff)
  const siti = employees.find(e => e.name === 'Siti Aminah');
  await prisma.user.create({
    data: {
      username: 'hrd',
      password: await bcrypt.hash(passwords.hrd, 10),
      role: 'ADMIN',
      employeeId: siti.id,
      mustChangePassword: false
    }
  });

  // 3. Accounting (Dewi Lestari - Finance Supervisor)
  const dewi = employees.find(e => e.name === 'Dewi Lestari');
  await prisma.user.create({
    data: {
      username: 'acc',
      password: await bcrypt.hash(passwords.acc, 10),
      role: 'ACCOUNTING',
      employeeId: dewi.id,
      mustChangePassword: false
    }
  });

  // 4. Manager (Rudi Hermawan - Production Manager)
  const rudi = employees.find(e => e.name === 'Rudi Hermawan');
  const mgrUser = await prisma.user.create({
    data: {
      username: 'manager',
      password: await bcrypt.hash(passwords.manager, 10),
      role: 'MANAGER',
      employeeId: rudi.id,
      mustChangePassword: false
    }
  });
  await prisma.managerAccess.create({
    data: {
      userId: mgrUser.id,
      managedDeptId: deptProduksi.id,
      manageAllDepts: false
    }
  });

  // 5. Employee (Toni Haryanto - Sewing Operator 1)
  const toni = employees.find(e => e.name === 'Toni Haryanto');
  await prisma.user.create({
    data: {
      username: 'karyawan',
      password: await bcrypt.hash(passwords.karyawan, 10),
      role: 'EMPLOYEE',
      employeeId: toni.id,
      mustChangePassword: false
    }
  });
  console.log('✅ System login accounts (admin, hrd, acc, manager, karyawan) created');

  // ─── Create Attendance Data (30 Days) ─────────────────
  console.log('⌛ Generating 30 days of attendance data for all active employees...');
  const activeEmployees = employees.filter(e => e.status === 'ACTIVE');
  const attRecords = [];

  const today = new Date();
  const startDay = new Date();
  startDay.setDate(today.getDate() - 30);

  for (let d = new Date(startDay); d <= today; d.setDate(d.getDate() + 1)) {
    const isWeekend = d.getDay() === 0; // Sunday only
    const isSaturday = d.getDay() === 6;

    if (isWeekend) continue;

    const dateStr = d.toISOString().split('T')[0];

    for (const emp of activeEmployees) {
      // Random variations: 90% Present, 4% Late, 3% Sick/Leave, 3% Absent
      const rand = Math.random();
      
      let status = 'PRESENT';
      let checkIn = null;
      let checkOut = null;
      let lateMinutes = 0;
      let overtimeHours = 0;
      let mode = 'Face_Web';

      if (rand < 0.03) {
        status = 'ABSENT';
      } else if (rand < 0.06) {
        status = 'SAKIT';
        mode = 'Manual';
      } else {
        // Present or Late
        // Standard check-in
        const checkinTime = new Date(`${dateStr}T08:00:00`);
        const checkoutTime = new Date(`${dateStr}T17:00:00`);

        // Check-in deviation: normal checked-in between 07:45 and 08:30
        const devInMin = Math.floor(-15 + Math.random() * 45); // -15 to +30 min
        checkIn = new Date(checkinTime.getTime() + devInMin * 60000);
        
        if (devInMin > 15) {
          status = 'LATE';
          lateMinutes = devInMin - 15;
        }

        // Check-out deviation: normally between 17:00 and 19:30
        const devOutMin = Math.floor(Math.random() * 150); // 0 to +150 min
        checkOut = new Date(checkoutTime.getTime() + devOutMin * 60000);

        if (isSaturday) {
          // Half day
          const satCheckout = new Date(`${dateStr}T13:00:00`);
          checkOut = new Date(satCheckout.getTime() + Math.floor(Math.random() * 30) * 60000);
        }

        // Overtime check (after 17:30 on weekdays, overtime starts)
        const diffFromCheckout = (checkOut.getTime() - checkoutTime.getTime()) / 3600000;
        if (!isSaturday && diffFromCheckout > 0.5) {
          overtimeHours = parseFloat(diffFromCheckout.toFixed(1));
        }
      }

      attRecords.push({
        employeeId: emp.id,
        date: new Date(dateStr),
        checkIn,
        checkOut,
        status,
        lateMinutes,
        overtimeHours,
        mode,
        source: Math.random() > 0.3 ? 'fingerprint' : 'face_web',
        notes: status === 'SAKIT' ? 'Surat dokter terlampir' : null
      });
    }
  }

  // Batch insert attendance
  await prisma.attendance.createMany({ data: attRecords });
  console.log(`✅ Loaded ${attRecords.length} attendance records`);

  // ─── Create Leave & Correction Requests ────────────────
  await prisma.leaveRequest.createMany({
    data: [
      { employeeId: budi.id, startDate: new Date('2026-06-10'), endDate: new Date('2026-06-12'), type: 'Cuti', reason: 'Acara keluarga di kampung', status: 'APPROVED', reviewNote: 'Disetujui, koordinasi dengan staff hrd.' },
      { employeeId: toni.id, startDate: new Date('2026-06-20'), endDate: new Date('2026-06-20'), type: 'Izin', reason: 'Mengurus perpanjangan STNK', status: 'APPROVED', reviewNote: 'OK' },
      { employeeId: siti.id, startDate: new Date('2026-06-28'), endDate: new Date('2026-06-29'), type: 'Cuti', reason: 'Liburan akhir pekan panjang', status: 'PENDING', reviewNote: null },
      { employeeId: dewi.id, startDate: new Date('2026-06-05'), endDate: new Date('2026-06-05'), type: 'Sakit', reason: 'Demam tinggi', status: 'REJECTED', reviewNote: 'Surat dokter tidak dilampirkan.' }
    ]
  });

  await prisma.correctionRequest.createMany({
    data: [
      { employeeId: toni.id, date: new Date('2026-06-15'), type: 'In', time: '08:02', reason: 'Lupa scan saat masuk pagi hari', status: 'APPROVED', reviewNote: 'Log mesin finger menunjukkan jam 08:02. Disetujui.' },
      { employeeId: siti.id, date: new Date('2026-06-22'), type: 'Out', time: '17:15', reason: 'Mesin fingerprint mati total saat pulang', status: 'PENDING', reviewNote: null }
    ]
  });
  console.log('✅ Leave & Correction requests created');

  // ─── Create Announcements ─────────────────────────────
  await prisma.announcement.createMany({
    data: [
      { title: 'Selamat Datang di Versi Demo!', content: 'Ini adalah Smart Attendance Pro versi demonstrasi. Semua modul aktif dan data di dalamnya adalah data simulasi.', type: 'General', author: 'Sistem Demo' },
      { title: 'Pemberitahuan Uji Coba Liveness', content: 'Silakan coba modul verifikasi wajah (Face Recognition) di halaman scan presensi. Harap pastikan pencahayaan cukup.', type: 'General', author: 'IT Support' },
      { title: 'Update Penggajian Demo', content: 'Modul Payroll telah di-generate untuk bulan Mei 2026 sebagai contoh laporan gaji.', type: 'General', author: 'Finance Admin' }
    ]
  });
  console.log('✅ Announcements created');

  // ─── Create Dummy Devices ─────────────────────────────
  await prisma.device.createMany({
    data: [
      { name: 'Mesin Lobby Utama', ipAddress: '192.168.1.100', port: 4370, status: 'ONLINE', autoSyncEnabled: true, autoSyncTime: '17:00' },
      { name: 'Mesin Area Produksi', ipAddress: '192.168.1.101', port: 4370, status: 'ONLINE', autoSyncEnabled: false, autoSyncTime: null }
    ]
  });
  console.log('✅ Dummy devices registered');

  // ─── Create Payroll Data (Mei 2026 - COMPLETED) ───────
  const payroll = await prisma.payroll.create({
    data: {
      period: '2026-05',
      periodName: 'Mei 2026',
      status: 'COMPLETED',
      totalEmployees: activeEmployees.length,
      totalGross: 245000000,
      totalDeductions: 8500000,
      totalNet: 236500000,
      totalOvertime: 12000000,
      generatedBy: 'acc',
      approvedBy: 'admin',
      approvedAt: new Date(),
      notes: 'Gaji bulan Mei 2026, ditransfer tanggal 28 Mei.'
    }
  });

  const payrollDetails = [];
  for (const emp of activeEmployees) {
    const salInfo = await prisma.employeeSalary.findUnique({ where: { employeeId: emp.id } });
    const gross = (salInfo?.baseSalary || 4500000) + 150000; // base + allowances
    const deduct = Math.floor(gross * 0.03); // 3% deductions (BPJS etc)
    const net = gross - deduct;

    payrollDetails.push({
      payrollId: payroll.id,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.employeeCode,
      department: emp.division,
      employmentType: salInfo?.employmentType || 'KONTRAK',
      salaryType: salInfo?.salaryType || 'MONTHLY',
      workingDays: 25,
      daysPresent: 24,
      daysAbsent: 0,
      daysLate: 1,
      baseSalary: salInfo?.baseSalary || 4500000,
      proRatedSalary: salInfo?.baseSalary || 4500000,
      allowances: salInfo?.components || [],
      deductions: [
        { name: 'BPJS Kesehatan', value: Math.floor(gross * 0.01) },
        { name: 'BPJS Ketenagakerjaan (JHT)', value: Math.floor(gross * 0.02) }
      ],
      overtimeHours: 5,
      overtimePay: 150000,
      attendancePenalty: 0,
      grossPay: gross,
      totalDeduction: deduct,
      netPay: net
    });
  }

  await prisma.payrollDetail.createMany({ data: payrollDetails });
  console.log('✅ Payroll history data created (Mei 2026)');

  console.log('\n🎉 SMART ATTENDANCE PRO - DATABASE SEED COMPLETE!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('👤 Login credentials:');
  console.log('   - SUPER_ADMIN : admin / admin123');
  console.log('   - ADMIN       : hrd / hrd123');
  console.log('   - ACCOUNTING  : acc / acc123');
  console.log('   - MANAGER     : manager / mgr123');
  console.log('   - EMPLOYEE    : karyawan / emp123');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
