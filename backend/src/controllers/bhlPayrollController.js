const prisma = require('../prismaClient');
const { recordAuditLog } = require('./auditLogController');
const { handleControllerError } = require('../middleware/validate');

const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Hitung rekap upah BHL untuk satu bulan (dipakai untuk pratinjau & snapshot generate).
// BHL: upah = (Hadir + Telat + 0,5×Setengah-hari) × tarif harian. TANPA lembur & TANPA potongan telat.
async function computeBhlSummaryData(month) {
  const [year, m] = month.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, m - 1, 1));
  const endDate = new Date(Date.UTC(year, m, 0, 23, 59, 59));

  const bhlEmployees = await prisma.employee.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { employmentStatus: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } },
        { salary: { employmentType: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } } },
      ],
    },
    include: {
      salary: true,
      department: true,
      attendance: { where: { date: { gte: startDate, lte: endDate } } },
    },
  });

  const rows = bhlEmployees.map(emp => {
    const dailyRate = emp.salary?.dailyRate || 0;
    const workingDays = emp.attendance.filter(a => ['PRESENT', 'LATE'].includes(a.status)).length;
    const halfDays = emp.attendance.filter(a => a.status === 'HALF_DAY').length;
    const sickDays = emp.attendance.filter(a => a.status === 'SAKIT').length;
    const leaveDays = emp.attendance.filter(a => a.status === 'IZIN').length;
    const absentDays = emp.attendance.filter(a => ['ABSENT', 'MANGKIR'].includes(a.status)).length;
    const effectiveDays = workingDays + halfDays * 0.5;
    const totalWage = Math.round(effectiveDays * dailyRate);
    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      department: emp.department?.name || '-',
      dailyRate,
      workingDays,
      halfDays,
      sickDays,
      leaveDays,
      absentDays,
      effectiveDays,
      totalWage,
    };
  });

  return { rows, periodName: `${monthNames[m - 1]} ${year}` };
}

/** POST /api/bhl-payroll/generate  { month: "2026-05" } — snapshot rekap BHL ke record tersimpan. */
const generateBhlPayroll = async (req, res) => {
  try {
    const { month, notes } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Format bulan harus YYYY-MM' });
    }

    const existing = await prisma.bhlPayroll.findUnique({ where: { period: month } });
    if (existing && existing.status === 'FINALIZED') {
      return res.status(400).json({ success: false, message: `Penggajian BHL ${month} sudah FINAL dan terkunci.` });
    }

    const { rows, periodName } = await computeBhlSummaryData(month);
    const totalWage = rows.reduce((s, r) => s + r.totalWage, 0);
    const totalDays = rows.reduce((s, r) => s + r.workingDays, 0);

    // DRAFT yang ada di-refresh (snapshot ulang dari absensi terkini)
    if (existing) {
      await prisma.bhlPayrollDetail.deleteMany({ where: { bhlPayrollId: existing.id } });
      await prisma.bhlPayroll.delete({ where: { id: existing.id } });
    }

    const payroll = await prisma.bhlPayroll.create({
      data: {
        period: month,
        periodName,
        status: 'DRAFT',
        totalEmployees: rows.length,
        totalWage,
        totalDays,
        generatedBy: req.user?.username || 'System',
        notes: notes || null,
        details: { create: rows },
      },
      include: { details: true },
    });

    if (req.user) {
      recordAuditLog({
        userId: req.user.id, username: req.user.username, role: req.user.role,
        action: 'CREATE', entity: 'BhlPayroll', entityId: payroll.id,
        details: { period: month, totalEmployees: rows.length, totalWage }, ipAddress: req.ip,
      });
    }

    res.status(201).json({ success: true, message: `Penggajian BHL ${periodName} dibuat untuk ${rows.length} pekerja.`, data: payroll });
  } catch (err) {
    handleControllerError(res, err, 'bhlPayrollController.generate');
  }
};

/** GET /api/bhl-payroll/list */
const listBhlPayrolls = async (req, res) => {
  try {
    const data = await prisma.bhlPayroll.findMany({ orderBy: { period: 'desc' } });
    res.json({ success: true, data });
  } catch (err) {
    handleControllerError(res, err, 'bhlPayrollController.list');
  }
};

/** GET /api/bhl-payroll/:id */
const getBhlPayrollById = async (req, res) => {
  try {
    const payroll = await prisma.bhlPayroll.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { details: { orderBy: { employeeName: 'asc' } } },
    });
    if (!payroll) return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    res.json({ success: true, data: payroll });
  } catch (err) {
    handleControllerError(res, err, 'bhlPayrollController.getById');
  }
};

/** PUT /api/bhl-payroll/:id/finalize — kunci agar tidak berubah retroaktif. */
const finalizeBhlPayroll = async (req, res) => {
  try {
    const payroll = await prisma.bhlPayroll.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    if (payroll.status === 'FINALIZED') return res.status(400).json({ success: false, message: 'Sudah final.' });

    const updated = await prisma.bhlPayroll.update({
      where: { id: payroll.id },
      data: { status: 'FINALIZED', finalizedBy: req.user?.username || 'System', finalizedAt: new Date() },
    });
    if (req.user) {
      recordAuditLog({
        userId: req.user.id, username: req.user.username, role: req.user.role,
        action: 'UPDATE', entity: 'BhlPayroll', entityId: payroll.id,
        details: { period: payroll.period, status: 'FINALIZED' }, ipAddress: req.ip,
      });
    }
    res.json({ success: true, message: 'Penggajian BHL dikunci (FINAL).', data: updated });
  } catch (err) {
    handleControllerError(res, err, 'bhlPayrollController.finalize');
  }
};

/** DELETE /api/bhl-payroll/:id — hanya DRAFT yang boleh dihapus. */
const deleteBhlPayroll = async (req, res) => {
  try {
    const payroll = await prisma.bhlPayroll.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!payroll) return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' });
    if (payroll.status === 'FINALIZED') return res.status(400).json({ success: false, message: 'Tidak bisa hapus — sudah final.' });
    await prisma.bhlPayroll.delete({ where: { id: payroll.id } });
    res.json({ success: true, message: 'Draf penggajian BHL dihapus.' });
  } catch (err) {
    handleControllerError(res, err, 'bhlPayrollController.delete');
  }
};

/** GET /api/bhl-payroll/:id/slip/:empId — data slip 1 pekerja BHL. */
const getBhlSlip = async (req, res) => {
  try {
    const detail = await prisma.bhlPayrollDetail.findFirst({
      where: { bhlPayrollId: parseInt(req.params.id), employeeId: parseInt(req.params.empId) },
      include: { bhlPayroll: true },
    });
    if (!detail) return res.status(404).json({ success: false, message: 'Slip tidak ditemukan.' });
    res.json({ success: true, data: detail });
  } catch (err) {
    handleControllerError(res, err, 'bhlPayrollController.slip');
  }
};

/** GET /api/bhl-payroll/preview?month=YYYY-MM — pratinjau langsung (belum tersimpan). */
const previewBhlPayroll = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Format bulan harus YYYY-MM' });
    }
    const { rows, periodName } = await computeBhlSummaryData(month);
    res.json({
      success: true,
      data: rows,
      periodName,
      totals: { totalEmployees: rows.length, totalWage: rows.reduce((s, r) => s + r.totalWage, 0), totalDays: rows.reduce((s, r) => s + r.workingDays, 0) },
    });
  } catch (err) {
    handleControllerError(res, err, 'bhlPayrollController.preview');
  }
};

module.exports = {
  generateBhlPayroll,
  listBhlPayrolls,
  getBhlPayrollById,
  finalizeBhlPayroll,
  deleteBhlPayroll,
  getBhlSlip,
  previewBhlPayroll,
};
