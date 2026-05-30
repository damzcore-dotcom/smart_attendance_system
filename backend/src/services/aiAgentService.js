const { GoogleGenerativeAI } = require('@google/generative-ai');
const prisma = require('../prismaClient');

// Helper to check if API Key is set and valid
const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('CHANGE_ME') || key.trim() === '') {
    return null;
  }
  return key;
};

// Define tool schemas for Google Gemini
const toolDeclarations = [
  {
    name: 'getEmployeesList',
    description: 'Mengambil daftar karyawan aktif maupun non-aktif berdasarkan filter nama, departemen, atau jenis karyawan (Bulanan vs Harian/BHL).',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Cari berdasarkan nama karyawan (pencarian sebagian).' },
        department: { type: 'STRING', description: 'Nama departemen karyawan (contoh: IT, HR, Security, Produksi).' },
        status: { type: 'STRING', description: 'Status karyawan (ACTIVE, ON_LEAVE, TERMINATED).' },
        employmentType: { type: 'STRING', description: 'Jenis hubungan kerja: TETAP, KONTRAK, atau HARIAN (untuk Buruh Harian Lepas/BHL).' }
      }
    }
  },
  {
    name: 'getAttendanceLogs',
    description: 'Mengambil log absensi masuk dan keluar untuk seluruh karyawan atau karyawan tertentu pada tanggal atau rentang tanggal tertentu.',
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
  }
];

// Implementations of database query functions using Prisma
const databaseTools = {
  getEmployeesList: async ({ name, department, status, employmentType }) => {
    try {
      const filters = {};
      
      if (name) {
        filters.name = { contains: name, mode: 'insensitive' };
      }
      if (status) {
        filters.status = status;
      }
      if (department) {
        filters.department = { name: { contains: department, mode: 'insensitive' } };
      }

      // Check employmentType inside EmployeeSalary table (joined relation)
      if (employmentType) {
        filters.salary = { employmentType: employmentType };
      }

      const employees = await prisma.employee.findMany({
        where: filters,
        take: 30, // Limit to prevent token bloat
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
          salary: { select: { employmentType: true, salaryType: true } }
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
        const parsedDate = new Date(date);
        filters.date = parsedDate;
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

      return logs.map(log => ({
        id: log.id,
        tanggal: log.date.toISOString().split('T')[0],
        nik: log.employee.employeeCode,
        nama: log.employee.name,
        departemen: log.employee.department?.name || 'N/A',
        jamMasuk: log.checkIn ? new Date(log.checkIn).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
        jamKeluar: log.checkOut ? new Date(log.checkOut).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
        statusKehadiran: log.status,
        keterlambatanMenit: log.lateMinutes,
        lemburJam: log.overtimeHours,
        metode: log.source,
        catatan: log.notes || '-'
      }));
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
  }
};

// Execute tool callback
const executeTool = async (name, args) => {
  console.log(`🤖 AI Tool Execution requested: ${name} with args:`, args);
  if (databaseTools[name]) {
    return await databaseTools[name](args);
  }
  throw new Error(`Tool ${name} is not defined.`);
};

// Mock agent fallback if API key is missing
const handleMockChat = async (message, history) => {
  const userMessage = message.toLowerCase();
  
  // Basic DB querying for mock info to present meaningful information even without API key
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
      "Halo! Saya adalah AI Agent Smart Attendance.\n" +
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
  const apiKey = getApiKey();
  
  if (!apiKey) {
    return await handleMockChat(message, chatHistory);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ functionDeclarations: toolDeclarations }],
      systemInstruction: `Anda adalah Smart Attendance AI Assistant (Asisten AI Absensi Pintar), sebuah agen cerdas yang terintegrasi secara langsung ke database sistem Smart Attendance Pro.
      
      User yang berbicara dengan Anda adalah personil berwenang dengan detail berikut:
      - Nama: ${userContext.username}
      - Role: ${userContext.role}
      
      Wewenang Anda:
      - Anda BOLEH melakukan query tentang karyawan, BHL (Buruh Harian Lepas), absensi, cuti/izin menggunakan fungsi-fungsi database (tools) yang disediakan.
      - Berikan jawaban yang ramah, sopan, profesional, dan ringkas dalam Bahasa Indonesia yang baik.
      - Jika ditanya rekap absensi, presentasikan dalam bentuk poin-poin yang mudah dibaca atau tabel markdown jika diperlukan.
      - Sebutkan tanggal saat ini (${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}) sebagai acuan jika user menanyakan informasi hari ini.`
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
    while (response.functionCalls && response.functionCalls.length > 0 && loopCount < 5) {
      loopCount++;
      const functionCalls = response.functionCalls;
      
      // Execute the first function call requested by the model
      const call = functionCalls[0];
      const { name, args } = call;

      let toolResult;
      try {
        toolResult = await executeTool(name, args);
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
    }

    return response.text();
  } catch (error) {
    console.error('CRITICAL AI Agent Error:', error);
    return `Maaf, terjadi kesalahan internal pada sistem asisten AI: ${error.message}. Mohon coba beberapa saat lagi atau periksa konfigurasi API Key Anda.`;
  }
};

module.exports = {
  runAiChat
};
