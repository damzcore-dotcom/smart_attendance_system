const { GoogleGenerativeAI } = require('@google/generative-ai');
const prisma = require('../prismaClient');
const localNlpService = require('./localNlpService');

// Helper to check if API Key is set and valid
const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('CHANGE_ME') || key.trim() === '') {
    return null;
  }
  return key;
};

// Calculate lateness rounded to 30-minute blocks with 8-minute grace period
const calculateLatenessPenaltyDetails = (lateMinutes) => {
  if (lateMinutes <= 8) {
    return {
      isLate: false,
      lateMinutes,
      penaltyMinutes: 0,
      penaltyDescription: 'Masuk dalam toleransi keterlambatan (keringan 8 menit).'
    };
  }
  
  // Round up to nearest 30 minutes block
  const penaltyMinutes = Math.ceil(lateMinutes / 30) * 30;
  return {
    isLate: true,
    lateMinutes,
    penaltyMinutes,
    penaltyDescription: `Terlambat ${lateMinutes} menit, dibulatkan menjadi denda ${penaltyMinutes} menit (dibulatkan per 30 menit).`
  };
};

// Fuzzy String Similarity (Levenshtein Distance)
const getSimilarity = (s1, s2) => {
  const longer = s1.toLowerCase();
  const shorter = s2.toLowerCase();
  if (longer.length < shorter.length) {
    return getSimilarity(shorter, longer);
  }
  if (longer.length === 0) {
    return 1.0;
  }
  
  const editDistance = (str1, str2) => {
    const costs = [];
    for (let i = 0; i <= str1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= str2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (str1.charAt(i - 1) !== str2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[str2.length] = lastValue;
    }
    return costs[str2.length];
  };
  
  return (longer.length - editDistance(longer, shorter)) / parseFloat(longer.length);
};

// Define tool schemas for Google Gemini
const toolDeclarations = [
  {
    name: 'getEmployeesList',
    description: 'Mengambil daftar karyawan aktif maupun non-aktif berdasarkan filter nama, departemen, atau jenis karyawan (Bulanan vs Harian/BHL). Mendukung pencarian toleran salah eja.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Cari berdasarkan nama karyawan (pencarian sebagian atau toleran salah ketik).' },
        department: { type: 'STRING', description: 'Nama departemen karyawan (contoh: IT, HR, Security, Produksi).' },
        status: { type: 'STRING', description: 'Status karyawan (ACTIVE, ON_LEAVE, TERMINATED).' },
        employmentType: { type: 'STRING', description: 'Jenis hubungan kerja: TETAP, KONTRAK, atau HARIAN (untuk Buruh Harian Lepas/BHL).' }
      }
    }
  },
  {
    name: 'getAttendanceLogs',
    description: 'Mengambil log absensi masuk dan keluar untuk seluruh karyawan atau karyawan tertentu pada tanggal atau rentang tanggal tertentu. Menyertakan detail kalkulasi menit denda keterlambatan.',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Tanggal spesifik absensi (format: YYYY-MM-DD).' },
        startDate: { type: 'STRING', description: 'Mulai tanggal pencarian log (format: YYYY-MM-DD).' },
        endDate: { type: 'STRING', description: 'Sampai tanggal pencarian log (format: YYYY-MM-DD).' },
        employeeName: { type: 'STRING', description: 'Nama karyawan untuk memfilter log absensi.' },
        status: { type: 'STRING', description: 'Status kehadiran (PRESENT, LATE, ABSENT, SAKIT, IZIN, CUTI).' }
      }
    }
  },
  {
    name: 'getLeaveRequests',
    description: 'Mengambil daftar pengajuan cuti, sakit, atau izin dari karyawan beserta alasannya dan status persetujuannya.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: { type: 'STRING', description: 'Status pengajuan cuti (PENDING, APPROVED, REJECTED).' },
        employeeName: { type: 'STRING', description: 'Filter berdasarkan nama karyawan.' }
      }
    }
  },
  {
    name: 'getDashboardSummaryStats',
    description: 'Mengambil rekapitulasi data dashboard seperti total karyawan aktif, jumlah absensi hari ini (hadir, telat, absen), dan jumlah departemen.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'getEmployeeSalaryAndPayroll',
    description: 'AKSES TERBATAS. Mengambil informasi gaji pokok karyawan, rincian komponen tunjangan/potongan, serta slip gaji bulanan/rekap payroll periode tertentu. Hanya boleh dipanggil oleh SUPER_ADMIN, DIREKTUR, dan MANAGER.',
    parameters: {
      type: 'OBJECT',
      properties: {
        employeeName: { type: 'STRING', description: 'Nama karyawan untuk dicari gajinya.' },
        period: { type: 'STRING', description: 'Periode rekap payroll bulanan (format: YYYY-MM, contoh: 2026-05).' }
      }
    }
  },
  {
    name: 'getShiftSchedules',
    description: 'Mengambil daftar jadwal kerja shift utama karyawan dan riwayat rotasi/override shift pada rentang waktu tertentu.',
    parameters: {
      type: 'OBJECT',
      properties: {
        employeeName: { type: 'STRING', description: 'Nama karyawan untuk dicari jadwal kerjanya.' },
        department: { type: 'STRING', description: 'Filter berdasarkan nama departemen.' }
      }
    }
  },
  {
    name: 'getFingerprintDevicesStatus',
    description: 'Mengambil status koneksi perangkat mesin absensi sidik jari (Fingerprint) yang terdaftar beserta informasi log sinkronisasi terakhir.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'getSystemAuditLogs',
    description: 'AKSES TERBATAS. Mengambil log audit aktivitas sistem untuk melacak tindakan modifikasi (tambah, ubah, hapus) oleh user admin. Hanya boleh dipanggil oleh SUPER_ADMIN dan ADMIN.',
    parameters: {
      type: 'OBJECT',
      properties: {
        username: { type: 'STRING', description: 'Filter berdasarkan nama user yang melakukan aksi.' },
        action: { type: 'STRING', description: 'Jenis tindakan (contoh: CREATE, UPDATE, DELETE, LOGIN, SYNC).' }
      }
    }
  }
];

// Implementations of database query functions using Prisma
const databaseTools = {
  getEmployeesList: async ({ name, department, status, employmentType }) => {
    try {
      const filters = {};
      
      if (status) {
        filters.status = status;
      }
      if (department) {
        filters.department = { name: { contains: department, mode: 'insensitive' } };
      }
      if (employmentType) {
        filters.salary = { employmentType: employmentType };
      }

      // Check if we need to do fuzzy matching on name
      if (name) {
        // First try standard partial match
        filters.name = { contains: name, mode: 'insensitive' };
        let employees = await prisma.employee.findMany({
          where: filters,
          take: 30,
          select: {
            id: true,
            employeeCode: true,
            name: true,
            email: true,
            position: true,
            division: true,
            status: true,
            gender: true,
            salaryCategory: true,
            department: { select: { name: true } },
            salary: { select: { employmentType: true } }
          }
        });

        // If no match found, fetch all and try fuzzy matching
        if (employees.length === 0) {
          delete filters.name;
          const allEmployees = await prisma.employee.findMany({
            where: filters,
            select: {
              id: true,
              employeeCode: true,
              name: true,
              email: true,
              position: true,
              division: true,
              status: true,
              gender: true,
              salaryCategory: true,
              department: { select: { name: true } },
              salary: { select: { employmentType: true } }
            }
          });

          // Filter by string similarity index > 0.45
          employees = allEmployees
            .map(emp => ({ ...emp, similarity: getSimilarity(emp.name, name) }))
            .filter(emp => emp.similarity > 0.45)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 15);
        }

        return employees.map(emp => ({
          id: emp.id,
          nik: emp.employeeCode,
          nama: emp.name,
          email: emp.email,
          jabatan: emp.position,
          divisi: emp.division,
          departemen: emp.department?.name || 'N/A',
          status: emp.status,
          tipeKaryawan: emp.salary?.employmentType || (emp.salaryCategory === 'BHL' ? 'HARIAN' : 'TETAP'),
          gender: emp.gender === 'L' ? 'Laki-laki' : emp.gender === 'P' ? 'Perempuan' : emp.gender
        }));
      }

      const employees = await prisma.employee.findMany({
        where: filters,
        take: 30,
        select: {
          id: true,
          employeeCode: true,
          name: true,
          email: true,
          position: true,
          division: true,
          status: true,
          gender: true,
          salaryCategory: true,
          department: { select: { name: true } },
          salary: { select: { employmentType: true } }
        }
      });

      return employees.map(emp => ({
        id: emp.id,
        nik: emp.employeeCode,
        nama: emp.name,
        email: emp.email,
        jabatan: emp.position,
        divisi: emp.division,
        departemen: emp.department?.name || 'N/A',
        status: emp.status,
        tipeKaryawan: emp.salary?.employmentType || (emp.salaryCategory === 'BHL' ? 'HARIAN' : 'TETAP'),
        gender: emp.gender === 'L' ? 'Laki-laki' : emp.gender === 'P' ? 'Perempuan' : emp.gender
      }));
    } catch (error) {
      console.error('Error in getEmployeesList tool:', error);
      return { error: error.message };
    }
  },

  getAttendanceLogs: async ({ date, startDate, endDate, employeeName, status }) => {
    try {
      const filters = {};
      
      if (date) {
        filters.date = new Date(date);
      } else if (startDate || endDate) {
        filters.date = {};
        if (startDate) filters.date.gte = new Date(startDate);
        if (endDate) filters.date.lte = new Date(endDate);
      } else {
        // Default to today
        filters.date = new Date(new Date().setHours(0,0,0,0));
      }

      if (status) {
        filters.status = status;
      }

      if (employeeName) {
        filters.employee = { name: { contains: employeeName, mode: 'insensitive' } };
      }

      const logs = await prisma.attendance.findMany({
        where: filters,
        take: 50,
        orderBy: { date: 'desc' },
        select: {
          id: true,
          date: true,
          checkIn: true,
          checkOut: true,
          status: true,
          lateMinutes: true,
          overtimeHours: true,
          source: true,
          notes: true,
          employee: {
            select: {
              name: true,
              employeeCode: true,
              department: { select: { name: true } }
            }
          }
        }
      });

      return logs.map(log => {
        const penaltyInfo = calculateLatenessPenaltyDetails(log.lateMinutes);
        return {
          id: log.id,
          tanggal: log.date.toISOString().split('T')[0],
          nik: log.employee.employeeCode,
          nama: log.employee.name,
          departemen: log.employee.department?.name || 'N/A',
          jamMasuk: log.checkIn ? new Date(log.checkIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
          jamKeluar: log.checkOut ? new Date(log.checkOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
          statusKehadiran: log.status,
          keterlambatanMenit: log.lateMinutes,
          dendaKeterlambatanMenit: penaltyInfo.penaltyMinutes,
          dendaKeterlambatanDetail: penaltyInfo.penaltyDescription,
          lemburJam: log.overtimeHours,
          metode: log.source,
          catatan: log.notes || '-'
        };
      });
    } catch (error) {
      console.error('Error in getAttendanceLogs tool:', error);
      return { error: error.message };
    }
  },

  getLeaveRequests: async ({ status, employeeName }) => {
    try {
      const filters = {};
      
      if (status) {
        filters.status = status;
      }
      if (employeeName) {
        filters.employee = { name: { contains: employeeName, mode: 'insensitive' } };
      }

      const leaves = await prisma.leaveRequest.findMany({
        where: filters,
        take: 30,
        orderBy: { startDate: 'desc' },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          type: true,
          reason: true,
          status: true,
          reviewNote: true,
          employee: {
            select: {
              name: true,
              employeeCode: true,
              department: { select: { name: true } }
            }
          }
        }
      });

      return leaves.map(leave => ({
        id: leave.id,
        nik: leave.employee.employeeCode,
        nama: leave.employee.name,
        departemen: leave.employee.department?.name || 'N/A',
        tanggalMulai: leave.startDate.toISOString().split('T')[0],
        tanggalSelesai: leave.endDate.toISOString().split('T')[0],
        jenisIzin: leave.type,
        alasan: leave.reason,
        statusPersetujuan: leave.status,
        catatanReview: leave.reviewNote || '-'
      }));
    } catch (error) {
      console.error('Error in getLeaveRequests tool:', error);
      return { error: error.message };
    }
  },

  getDashboardSummaryStats: async () => {
    try {
      const totalEmployees = await prisma.employee.count({ where: { status: 'ACTIVE' } });
      const totalBhl = await prisma.employee.count({ 
        where: { 
          status: 'ACTIVE',
          OR: [
            { salaryCategory: 'BHL' },
            { salary: { employmentType: 'HARIAN' } }
          ]
        } 
      });
      const totalDepartments = await prisma.department.count();

      // Attendance statistics for today
      const today = new Date(new Date().setHours(0,0,0,0));
      const todayAttendance = await prisma.attendance.findMany({
        where: { date: today }
      });

      const present = todayAttendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length;
      const late = todayAttendance.filter(a => a.status === 'LATE').length;
      const absent = todayAttendance.filter(a => a.status === 'ABSENT' || a.status === 'MANGKIR').length;
      const leave = todayAttendance.filter(a => ['SAKIT', 'IZIN', 'CUTI'].includes(a.status)).length;

      return {
        totalKaryawanAktif: totalEmployees,
        totalBhlAktif: totalBhl,
        totalKaryawanBulananAktif: totalEmployees - totalBhl,
        totalDepartemen: totalDepartments,
        absensiHariIni: {
          tanggal: today.toISOString().split('T')[0],
          hadir: present,
          terlambat: late,
          absenMangkir: absent,
          cutiSakitIzin: leave
        }
      };
    } catch (error) {
      console.error('Error in getDashboardSummaryStats tool:', error);
      return { error: error.message };
    }
  },

  getEmployeeSalaryAndPayroll: async ({ employeeName, period }, userContext) => {
    try {
      // STRICT RBAC Verification
      const allowedRoles = ['SUPER_ADMIN', 'DIREKTUR', 'MANAGER', 'ACCOUNTING'];
      if (!userContext || !allowedRoles.includes(userContext.role)) {
        return { error: 'Akses ditolak. Informasi gaji dan payroll bersifat sangat rahasia. Hanya untuk level SUPER_ADMIN, DIREKTUR, MANAGER, dan ACCOUNTING.' };
      }

      // 1. If period is requested (Bulk Payroll Summary)
      if (period && !employeeName) {
        const payroll = await prisma.payroll.findUnique({
          where: { period },
          include: {
            details: {
              select: {
                employeeName: true,
                employeeCode: true,
                department: true,
                netPay: true,
                grossPay: true,
                attendancePenalty: true
              }
            }
          }
        });

        if (!payroll) return { message: `Data payroll untuk periode ${period} belum digenerate.` };

        return {
          periode: payroll.periodName,
          status: payroll.status,
          totalKaryawanTerbayar: payroll.totalEmployees,
          totalPengeluaranGajiGross: payroll.totalGross,
          totalPengeluaranGajiNet: payroll.totalNet,
          totalPotonganKehadiran: payroll.details.reduce((sum, d) => sum + d.attendancePenalty, 0),
          daftarRincianKaryawan: payroll.details.slice(0, 15).map(d => ({
            nama: d.employeeName,
            nik: d.employeeCode,
            departemen: d.department,
            gajiKotor: d.grossPay,
            dendaKehadiran: d.attendancePenalty,
            gajiBersih: d.netPay
          }))
        };
      }

      // 2. If employeeName is requested
      if (employeeName) {
        // Find employee with fuzzy support
        const employees = await prisma.employee.findMany({
          where: { name: { contains: employeeName, mode: 'insensitive' } },
          select: {
            id: true,
            name: true,
            employeeCode: true,
            position: true,
            department: { select: { name: true } },
            salary: true,
            payrollDetails: {
              take: 3,
              orderBy: { createdAt: 'desc' },
              select: {
                netPay: true,
                grossPay: true,
                createdAt: true
              }
            }
          }
        });

        if (employees.length === 0) return { message: `Karyawan dengan nama "${employeeName}" tidak ditemukan.` };
        const emp = employees[0];

        return {
          nama: emp.name,
          nik: emp.employeeCode,
          jabatan: emp.position,
          departemen: emp.department?.name || 'N/A',
          tipeGaji: emp.salary?.salaryType || 'MONTHLY',
          gajiPokokBase: emp.salary?.baseSalary || 0,
          tarifHarian: emp.salary?.dailyRate || 0,
          komponenGajiLainnya: emp.salary?.components || [],
          riwayatPayrollTerakhir: emp.payrollDetails.map(pd => ({
            gajiKotor: pd.grossPay,
            gajiBersih: pd.netPay,
            tanggalPencairan: pd.createdAt.toISOString().split('T')[0]
          }))
        };
      }

      return { error: 'Mohon cantumkan parameter nama karyawan atau periode payroll.' };
    } catch (error) {
      console.error('Error in getEmployeeSalaryAndPayroll tool:', error);
      return { error: error.message };
    }
  },

  getShiftSchedules: async ({ employeeName, department }) => {
    try {
      const filters = {};
      if (department) {
        filters.department = { name: { contains: department, mode: 'insensitive' } };
      }
      if (employeeName) {
        filters.name = { contains: employeeName, mode: 'insensitive' };
      }

      const schedules = await prisma.employee.findMany({
        where: filters,
        take: 30,
        select: {
          name: true,
          employeeCode: true,
          department: { select: { name: true } },
          shift: {
            select: {
              name: true,
              startTime: true,
              endTime: true,
              gracePeriod: true
            }
          },
          shiftOverrides: {
            take: 3,
            orderBy: { startDate: 'desc' },
            select: {
              startDate: true,
              endDate: true,
              shift: {
                select: {
                  name: true,
                  startTime: true,
                  endTime: true
                }
              }
            }
          }
        }
      });

      return schedules.map(s => ({
        nama: s.name,
        nik: s.employeeCode,
        departemen: s.department?.name || 'N/A',
        shiftUtama: s.shift ? `${s.shift.name} (${s.shift.startTime} - ${s.shift.endTime}, toleransi ${s.shift.gracePeriod} menit)` : 'Belum diset',
        overrideShiftTerakhir: s.shiftOverrides.map(o => ({
          shift: `${o.shift.name} (${o.shift.startTime} - ${o.shift.endTime})`,
          dariTanggal: o.startDate.toISOString().split('T')[0],
          sampaiTanggal: o.endDate.toISOString().split('T')[0]
        }))
      }));
    } catch (error) {
      console.error('Error in getShiftSchedules tool:', error);
      return { error: error.message };
    }
  },

  getFingerprintDevicesStatus: async () => {
    try {
      const devices = await prisma.device.findMany({
        select: {
          id: true,
          name: true,
          ipAddress: true,
          port: true,
          status: true,
          lastSync: true,
          autoSyncEnabled: true,
          autoSyncTime: true
        }
      });

      return devices.map(d => ({
        id: d.id,
        namaMesin: d.name,
        ipAddress: d.ipAddress,
        port: d.port,
        statusKoneksi: d.status,
        terakhirSinkronisasi: d.lastSync ? d.lastSync.toLocaleString('id-ID') : 'Belum pernah',
        sinkronisasiOtomatis: d.autoSyncEnabled ? `Aktif (Jam ${d.autoSyncTime})` : 'Mati'
      }));
    } catch (error) {
      console.error('Error in getFingerprintDevicesStatus tool:', error);
      return { error: error.message };
    }
  },

  getSystemAuditLogs: async ({ username, action }, userContext) => {
    try {
      // STRICT RBAC Verification
      const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'DIREKTUR', 'MANAGER', 'ACCOUNTING'];
      if (!userContext || !allowedRoles.includes(userContext.role)) {
        return { error: 'Akses ditolak. Hanya untuk level SUPER_ADMIN, ADMIN, DIREKTUR, MANAGER, dan ACCOUNTING.' };
      }

      const filters = {};
      if (username) {
        filters.username = { contains: username, mode: 'insensitive' };
      }
      if (action) {
        filters.action = action;
      }

      const logs = await prisma.auditLog.findMany({
        where: filters,
        take: 30,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          role: true,
          action: true,
          entity: true,
          details: true,
          ipAddress: true,
          createdAt: true
        }
      });

      return logs.map(l => ({
        id: l.id,
        waktu: l.createdAt.toLocaleString('id-ID'),
        user: l.username,
        role: l.role,
        tindakan: l.action,
        tabelTerdampak: l.entity,
        rincian: l.details || '-',
        ipClient: l.ipAddress || 'N/A'
      }));
    } catch (error) {
      console.error('Error in getSystemAuditLogs tool:', error);
      return { error: error.message };
    }
  }
};

// Execute tool callback
const executeTool = async (name, args, userContext) => {
  console.log(`🤖 AI Tool Execution requested: ${name} with args:`, args);
  if (databaseTools[name]) {
    return await databaseTools[name](args, userContext);
  }
  throw new Error(`Tool ${name} is not defined.`);
};

// Mock agent fallback if API key is missing
const handleMockChat = async (message, history) => {
  const userMessage = message.toLowerCase();
  let mockReply = "";

  if (userMessage.includes('karyawan') || userMessage.includes('pegawai')) {
    const stats = await databaseTools.getDashboardSummaryStats();
    const sampleEmp = await databaseTools.getEmployeesList({});
    const samples = sampleEmp.slice(0, 3).map(e => '- **' + e.nama + '** (' + e.nik + ') - Dept: ' + e.departemen + ', Tipe: ' + e.tipeKaryawan).join('\n');
    
    mockReply = "**[MOCK AI - API KEY BELUM DIKONFIGURASI]**\n" +
      "Saat ini, sistem memiliki total **" + stats.totalKaryawanAktif + " karyawan aktif** (" + stats.totalBhlAktif + " di antaranya adalah BHL / Buruh Harian Lepas) di **" + stats.totalDepartemen + " departemen**.\n\n" +
      "Berikut beberapa contoh karyawan dalam database:\n" + samples + "\n\n" +
      "*(Silakan konfigurasi `GEMINI_API_KEY` di file `.env` server untuk mengaktifkan AI yang pintar).*";
  } else if (userMessage.includes('absen') || userMessage.includes('kehadiran') || userMessage.includes('masuk')) {
    const stats = await databaseTools.getDashboardSummaryStats();
    
    mockReply = "**[MOCK AI - API KEY BELUM DIKONFIGURASI]**\n" +
      "Berikut adalah rekapitulasi kehadiran hari ini (" + stats.absensiHariIni.tanggal + "):\n" +
      "- Hadir: **" + stats.absensiHariIni.hadir + "** orang (termasuk **" + stats.absensiHariIni.terlambat + "** orang terlambat)\n" +
      "- Absen/Mangkir: **" + stats.absensiHariIni.absenMangkir + "** orang\n" +
      "- Izin/Sakit/Cuti: **" + stats.absensiHariIni.cutiSakitIzin + "** orang\n\n" +
      "*(Silakan konfigurasi `GEMINI_API_KEY` di file `.env` server untuk analisis data kehadiran yang lebih mendalam).*";
  } else if (userMessage.includes('cuti') || userMessage.includes('izin') || userMessage.includes('sakit')) {
    const leaveReqs = await databaseTools.getLeaveRequests({});
    if (leaveReqs.length === 0) {
      mockReply = "**[MOCK AI - API KEY BELUM DIKONFIGURASI]**\n" +
        "Tidak ada data pengajuan cuti atau izin dalam database saat ini.";
    } else {
      const samples = leaveReqs.slice(0, 3).map(l => '- **' + l.nama + '** (' + l.jenisIzin + '): ' + l.alasan + ' [Status: ' + l.statusPersetujuan + ']').join('\n');
      mockReply = "**[MOCK AI - API KEY BELUM DIKONFIGURASI]**\n" +
        "Ditemukan data pengajuan izin/cuti dalam database. Berikut beberapa di antaranya:\n" + samples + "\n\n" +
        "*(Silakan konfigurasi `GEMINI_API_KEY` di file `.env` server untuk bantuan persetujuan cuti).*";
    }
  } else {
    mockReply = "**[MOCK AI - API KEY BELUM DIKONFIGURASI]**\n" +
      "Halo! Saya adalah AI Agent Smart HRIS.\n" +
      "Untuk mengaktifkan seluruh kemampuan analisis saya (membaca database, membuat visualisasi, menjawab pertanyaan tentang data karyawan, absensi, BHL, dll.), silakan masukkan Google Gemini API Key Anda di file **`.env`** backend server dengan parameter:\n\n" +
      "```env\n" +
      "GEMINI_API_KEY=\"AIzaSyYourGeminiApiKeyHere...\"\n" +
      "```\n" +
      "*(Anda bisa mendapatkan API Key gratis di: https://aistudio.google.com/)*";
  }

  return mockReply;
};

// Primary chatbot function
const runAiChat = async (message, chatHistory, userContext) => {
  const mode = process.env.CHATBOT_MODE || 'local';
  const apiKey = getApiKey();
  
  if (mode === 'local' || !apiKey) {
    return await localNlpService.processLocalChat(message, chatHistory, userContext);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ functionDeclarations: toolDeclarations }],
      systemInstruction: `Anda adalah Smart HRIS AI Assistant (Asisten AI Smart HRIS), sebuah agen cerdas yang terintegrasi secara langsung ke database sistem Smart HRIS Platform.
      
      User yang berbicara dengan Anda adalah personil berwenang dengan detail berikut:
      - Nama: ${userContext.username}
      - Role: ${userContext.role}
      Wewenang & Aturan Keamanan Data (RBAC):
      - Anda memiliki akses ke data absensi, data cuti/izin, shift roster, dan status mesin fingerprint.
      - **PENTING (KEBIJAKAN KELAS GAJI / PAYROLL)**: Data gaji pokok, payroll bulanan, dan slip gaji HANYA boleh diakses oleh level role: SUPER_ADMIN, DIREKTUR, MANAGER, dan ACCOUNTING. Jika user dengan role ADMIN (Admin HRD) menanyakan tentang nominal gaji/payroll atau keuangan, jelaskan secara sopan bahwa wewenang mereka dibatasi hanya untuk mengelola data karyawan saja (profil, kehadiran, shift, izin, perangkat) dan tidak termasuk gaji.
      
      Aturan Perusahaan (PENTING untuk analisis keterlambatan):
      - Batas toleransi keterlambatan (keringan) adalah maksimal **8 menit** dari jadwal jam masuk shift.
      - Keterlambatan **<= 8 menit** dianggap **TIDAK TERLAMBAT** (Denda = 0).
      - Keterlambatan **> 8 menit** akan langsung dihitung denda dengan dibulatkan ke atas **per blok 30 menit**.
        Contoh kalkulasi denda:
        * Terlambat 9 menit (lewat batas 8 menit) $\rightarrow$ Denda dihitung **30 menit**.
        * Terlambat 30 menit $\rightarrow$ Denda dihitung **30 menit**.
        * Terlambat 31 menit $\rightarrow$ Denda dihitung **60 menit** (blok berikutnya).
        * Terlambat 65 menit $\rightarrow$ Denda dihitung **90 menit** (tiga blok).
      
      Panduan Jawaban Anda:
      ${(userContext.role === 'DIREKTUR' || userContext.role === 'MANAGER') ? `
      - LANGUAGE REQUIREMENT: Since the user is a Manager or Director, you MUST write your entire response in professional, natural English.
      - Answer in a friendly, polite, professional, and concise manner.
      - Present all attendance, stats, and payroll data in clean markdown tables or bullet points.
      - Refer to today's date (${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}) as a reference if the user asks relative questions like "today", "yesterday", or "last week".
      ` : `
      - Berikan jawaban yang ramah, sopan, profesional, dan ringkas dalam Bahasa Indonesia yang alami.
      - Jika ditanya rekap absensi atau payroll, presentasikan dalam bentuk tabel markdown atau poin-poin yang mudah dibaca.
      - Sebutkan tanggal saat ini (${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}) sebagai acuan jika user menanyakan informasi waktu relatif seperti "hari ini", "kemarin", atau "minggu lalu".
      `}`
    });

    // Format chat history for Gemini API
    const formattedHistory = chatHistory.map(chat => ({
      role: chat.role === 'user' ? 'user' : 'model',
      parts: [{ text: chat.text }]
    }));

    // Start chat session
    const chat = model.startChat({
      history: formattedHistory
    });

    let result = await chat.sendMessage(message);
    let response = result.response;

    // Handle tool execution loop (supports multiple/chain tool execution)
    let loopCount = 0;
    let calls = typeof response.functionCalls === 'function' ? response.functionCalls() : response.functionCalls;
    while (calls && calls.length > 0 && loopCount < 5) {
      loopCount++;
      const call = calls[0];
      const { name, args } = call;

      let toolResult;
      try {
        toolResult = await executeTool(name, args, userContext);
      } catch (err) {
        console.error(`Error executing tool ${name}:`, err);
        toolResult = { error: err.message };
      }

      // Send the tool outcome back to the chat session
      result = await chat.sendMessage([
        {
          functionResponse: {
            name: name,
            response: { result: toolResult }
          }
        }
      ]);
      response = result.response;
      calls = typeof response.functionCalls === 'function' ? response.functionCalls() : response.functionCalls;
    }

    return response.text();
  } catch (error) {
    console.error('CRITICAL AI Agent Error:', error);
    return `Maaf, terjadi kesalahan internal pada sistem asisten AI: ${error.message}. Mohon coba beberapa saat lagi atau periksa konfigurasi API Key Anda.`;
  }
};

module.exports = {
  runAiChat,
  databaseTools
};
