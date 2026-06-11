const prisma = require('../prismaClient');
const { recordAuditLog } = require('./auditLogController');

const { handleControllerError } = require('../middleware/validate');
/**
 * Submit or update KPI evaluation (Manager or Admin)
 */
const submitEvaluation = async (req, res) => {
  try {
    const { employeeId, period, targetKPI, reviewNote } = req.body;

    if (!employeeId || !period || !targetKPI || !Array.isArray(targetKPI)) {
      return res.status(400).json({ success: false, message: 'ID karyawan, periode, dan target KPI (array) harus diisi.' });
    }

    const employee = await prisma.employee.findUnique({ where: { id: parseInt(employeeId) } });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan.' });
    }

    // Calculate weighted final score
    let finalScore = 0;
    let totalWeight = 0;
    targetKPI.forEach(k => {
      const weight = parseFloat(k.weight) || 0;
      const score = parseFloat(k.score) || 0;
      finalScore += (score * weight) / 100;
      totalWeight += weight;
    });

    // Normalize final score if total weight is not exactly 100%
    if (totalWeight > 0 && Math.abs(totalWeight - 100) > 0.01) {
      finalScore = (finalScore / totalWeight) * 100;
    }

    const roundedScore = Math.round(finalScore * 100) / 100;

    const kpi = await prisma.employeeKPI.upsert({
      where: {
        employeeId_period: {
          employeeId: parseInt(employeeId),
          period
        }
      },
      update: {
        targetKPI,
        finalScore: roundedScore,
        reviewNote: reviewNote || null,
        evaluatedBy: req.user.username,
        status: 'PENDING'
      },
      create: {
        employeeId: parseInt(employeeId),
        period,
        targetKPI,
        finalScore: roundedScore,
        reviewNote: reviewNote || null,
        evaluatedBy: req.user.username,
        status: 'PENDING'
      },
      include: {
        employee: { select: { name: true, employeeCode: true } }
      }
    });

    // Record audit log
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'CREATE',
      entity: 'EmployeeKPI',
      entityId: kpi.id,
      details: JSON.stringify({
        employeeName: kpi.employee.name,
        period,
        finalScore: roundedScore
      }),
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, message: 'Penilaian KPI berhasil disimpan dan diajukan ke HRD.', data: kpi });
  } catch (err) {
    console.error('[KpiController.submitEvaluation] Error:', err);
    handleControllerError(res, err, 'kpiController');
  }
};

/**
 * Get all KPI evaluations
 */
const getKPIList = async (req, res) => {
  try {
    const { status, employeeId, period } = req.query;
    const where = {};

    const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTING', 'DIREKTUR', 'MANAGER'].includes(req.user.role);
    if (!isPrivileged) {
      if (!req.user.employeeId) {
        return res.status(403).json({ success: false, message: 'Akses ditolak.' });
      }
      where.employeeId = req.user.employeeId;
    } else if (employeeId) {
      where.employeeId = parseInt(employeeId);
    }

    if (status) {
      where.status = status;
    }

    if (period) {
      where.period = period;
    }

    const page = req.query.page ? parseInt(req.query.page) : null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    let pagination = null;
    let kpiList;

    if (page) {
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        prisma.employeeKPI.findMany({
          where,
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                employeeCode: true,
                position: true,
                department: { select: { name: true } }
              }
            }
          },
          orderBy: [
            { period: 'desc' },
            { finalScore: 'desc' }
          ],
          skip,
          take: limit
        }),
        prisma.employeeKPI.count({ where })
      ]);
      kpiList = data;
      pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };
    } else {
      kpiList = await prisma.employeeKPI.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              position: true,
              department: { select: { name: true } }
            }
          }
        },
        orderBy: [
          { period: 'desc' },
          { finalScore: 'desc' }
        ]
      });
    }

    res.json({ success: true, data: kpiList, pagination });
  } catch (err) {
    console.error('[KpiController.getKPIList] Error:', err);
    handleControllerError(res, err, 'kpiController');
  }
};

/**
 * Review KPI (Approve / Reject)
 */
const reviewKPI = async (req, res) => {
  try {
    const kpiId = parseInt(req.params.id);
    const { status, reviewNote } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status review tidak valid.' });
    }

    const kpi = await prisma.employeeKPI.findUnique({
      where: { id: kpiId },
      include: { employee: true }
    });

    if (!kpi) {
      return res.status(404).json({ success: false, message: 'Penilaian KPI tidak ditemukan.' });
    }

    const updatedKpi = await prisma.employeeKPI.update({
      where: { id: kpiId },
      data: { status, reviewNote: reviewNote || null }
    });

    // Record audit log
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'UPDATE',
      entity: 'EmployeeKPI',
      entityId: kpiId,
      details: JSON.stringify({
        employeeName: kpi.employee.name,
        period: kpi.period,
        score: kpi.finalScore,
        oldStatus: kpi.status,
        newStatus: status
      }),
      ipAddress: req.ip
    });

    // Send notification to employee
    await prisma.notification.create({
      data: {
        employeeId: kpi.employeeId,
        title: status === 'APPROVED' ? 'Penilaian KPI Disetujui' : 'Penilaian KPI Perlu Direvisi',
        message: `Penilaian KPI Anda untuk periode ${kpi.period} dengan skor ${kpi.finalScore} telah ${status === 'APPROVED' ? 'disetujui oleh HRD' : 'ditolak/butuh revisi. Catatan: ' + (reviewNote || '-')}`
      }
    });

    res.json({ success: true, message: `KPI berhasil di-${status.toLowerCase()}.`, data: updatedKpi });
  } catch (err) {
    console.error('[KpiController.reviewKPI] Error:', err);
    handleControllerError(res, err, 'kpiController');
  }
};

/**
 * Get KPI Statistics for Charts & Reporting
 */
const getKPIStats = async (req, res) => {
  try {
    const { period } = req.query;
    if (!period) {
      return res.status(400).json({ success: false, message: 'Periode harus disertakan (misal: 2026-Q1).' });
    }

    const kpis = await prisma.employeeKPI.findMany({
      where: { period, status: 'APPROVED' },
      include: {
        employee: {
          select: {
            name: true,
            department: { select: { name: true } }
          }
        }
      }
    });

    // Calculate performance distribution
    const distribution = { A: 0, B: 0, C: 0, D: 0 };
    let totalScore = 0;
    const deptScores = {};

    kpis.forEach(k => {
      const score = k.finalScore || 0;
      totalScore += score;

      if (score >= 90) distribution.A++;
      else if (score >= 80) distribution.B++;
      else if (score >= 70) distribution.C++;
      else distribution.D++;

      const deptName = k.employee.department?.name || 'Lainnya';
      if (!deptScores[deptName]) {
        deptScores[deptName] = { sum: 0, count: 0 };
      }
      deptScores[deptName].sum += score;
      deptScores[deptName].count++;
    });

    const averageScore = kpis.length > 0 ? Math.round((totalScore / kpis.length) * 100) / 100 : 0;

    const departmentAverages = Object.keys(deptScores).map(name => ({
      name,
      average: Math.round((deptScores[name].sum / deptScores[name].count) * 100) / 100
    }));

    const topPerformers = kpis
      .map(k => ({
        name: k.employee.name,
        department: k.employee.department?.name || '-',
        score: k.finalScore
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        totalEvaluated: kpis.length,
        averageScore,
        distribution,
        departmentAverages,
        topPerformers
      }
    });
  } catch (err) {
    console.error('[KpiController.getKPIStats] Error:', err);
    handleControllerError(res, err, 'kpiController');
  }
};

const parsePeriodDateRange = (period) => {
  const match = period.match(/^(\d{4})-(Q[1-4]|Annual)$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const q = match[2];
  let startDate, endDate;
  if (q === 'Q1') {
    startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(year, 2, 31, 23, 59, 59, 999));
  } else if (q === 'Q2') {
    startDate = new Date(Date.UTC(year, 3, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(year, 5, 30, 23, 59, 59, 999));
  } else if (q === 'Q3') {
    startDate = new Date(Date.UTC(year, 6, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(year, 8, 30, 23, 59, 59, 999));
  } else if (q === 'Q4') {
    startDate = new Date(Date.UTC(year, 9, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  } else if (q === 'Annual') {
    startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  }
  return { startDate, endDate };
};

/**
 * Calculate employee attendance percentage for a period
 */
const getKpiAttendancePercentage = async (req, res) => {
  try {
    const { employeeId, period } = req.query;
    if (!employeeId || !period) {
      return res.status(400).json({ success: false, message: 'ID karyawan dan periode harus disertakan.' });
    }

    const range = parsePeriodDateRange(period);
    if (!range) {
      return res.status(400).json({ success: false, message: 'Format periode tidak valid.' });
    }

    const { startDate, endDate } = range;

    const records = await prisma.attendance.findMany({
      where: {
        employeeId: parseInt(employeeId),
        date: { gte: startDate, lte: endDate }
      }
    });

    const presentCount = records.filter(r => ['PRESENT', 'LATE', 'EARLY_DEPARTURE', 'HALF_DAY'].includes(r.status)).length;
    const leaveCount = records.filter(r => ['CUTI', 'SAKIT', 'IZIN'].includes(r.status)).length;
    const absentCount = records.filter(r => ['ABSENT', 'MANGKIR'].includes(r.status)).length;
    const holidayCount = records.filter(r => r.status === 'HOLIDAY').length;
    const totalDays = presentCount + leaveCount + absentCount;

    const attendanceRate = totalDays > 0 ? Math.round((presentCount / totalDays) * 10000) / 100 : 100;

    res.json({
      success: true,
      data: {
        employeeId: parseInt(employeeId),
        period,
        startDate,
        endDate,
        present: presentCount,
        leave: leaveCount,
        absent: absentCount,
        holiday: holidayCount,
        totalWorkingDays: totalDays,
        attendanceRate
      }
    });
  } catch (err) {
    console.error('[KpiController.getKpiAttendancePercentage] Error:', err);
    handleControllerError(res, err, 'kpiController');
  }
};

module.exports = {
  submitEvaluation,
  getKPIList,
  reviewKPI,
  getKPIStats,
  getKpiAttendancePercentage
};
