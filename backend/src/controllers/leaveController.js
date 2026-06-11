const prisma = require('../prismaClient');
const { sendWAMessage } = require('../services/whatsappService');
const { uploadBase64ToMinio } = require('../utils/minioHelper');
const { handleControllerError } = require('../middleware/validate');

const mapLeaveRequest = (r) => {
  if (!r) return r;
  let attachmentUrl = r.medicalAttachment;
  if (attachmentUrl && attachmentUrl.startsWith('leave-attachments/')) {
    attachmentUrl = `/minio/${attachmentUrl}`;
  }
  return {
    ...r,
    medicalAttachment: attachmentUrl
  };
};

/**
 * POST /api/leave
 * Employee submits a leave request
 */
const create = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, type, reason } = req.body;

    if (!employeeId || !startDate || !endDate || !type || !reason) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date' });
    }

    let attachmentPath = null;
    if (req.body.medicalAttachment) {
      try {
        attachmentPath = await uploadBase64ToMinio('leave-attachments', req.body.medicalAttachment, `emp_${employeeId}`);
      } catch (uploadErr) {
        return res.status(400).json({ success: false, message: 'Gagal mengunggah lampiran medis: ' + uploadErr.message });
      }
    }

    const leave = await prisma.leaveRequest.create({
      data: {
        employeeId: parseInt(employeeId),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        type,
        reason,
        medicalAttachment: attachmentPath
      }
    });

    res.json({ success: true, message: 'Leave request submitted successfully', data: mapLeaveRequest(leave) });
  } catch (err) {
    handleControllerError(res, err, 'leaveController');
  }
};

/**
 * GET /api/leave
 * Admin lists all leave requests
 */
const getAll = async (req, res) => {
  try {
    const { status, search, dept } = req.query;
    const where = {};
    if (status && status !== 'All') where.status = status;
    
    const employeeFilter = {};
    if (search) employeeFilter.name = { contains: search, mode: 'insensitive' };
    if (dept && dept !== 'All') employeeFilter.department = { name: dept };
    
    if (Object.keys(employeeFilter).length > 0) {
      where.employee = employeeFilter;
    }

    const requests = await prisma.leaveRequest.findMany({
      where,
      include: { employee: { select: { name: true, employeeCode: true, department: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: requests.map(r => mapLeaveRequest({
        ...r,
        employeeName: r.employee.name,
        employeeCode: r.employee.employeeCode,
        dept: r.employee.department.name
      }))
    });
  } catch (err) {
    handleControllerError(res, err, 'leaveController');
  }
};

/**
 * GET /api/leave/employee/:empId
 * Employee lists their own requests
 */
const getByEmployee = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);
    const requests = await prisma.leaveRequest.findMany({
      where: { employeeId: empId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: requests.map(mapLeaveRequest) });
  } catch (err) {
    handleControllerError(res, err, 'leaveController');
  }
};

/**
 * PUT /api/leave/:id/review
 * Admin approves or rejects
 */
const review = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, reviewNote } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const leave = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { employee: true }
    });

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Use transaction to prevent race condition on quota deduction
    const updated = await prisma.$transaction(async (tx) => {
      // Re-fetch inside transaction to get latest state
      const freshLeave = await tx.leaveRequest.findUnique({ where: { id } });
      if (freshLeave.status !== 'PENDING') {
        throw new Error('This request has already been processed');
      }

      const result = await tx.leaveRequest.update({
        where: { id },
        data: { status, reviewNote }
      });

      // AUTO ATTENDANCE LOGIC & QUOTA DEDUCTION
      if (status === 'APPROVED') {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        
        // Calculate duration in days
        if (start > end) throw new Error('Invalid date range');
        const diffTime = end - start;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        
        if (diffDays > 60) throw new Error('Leave quota limits applied. Max duration exceeded.');

        // Deduct from quota if type is 'Cuti'
        if (leave.type === 'Cuti') {
          const employee = await tx.employee.findUnique({ where: { id: leave.employeeId } });
          if (employee.remainingLeave < diffDays) {
            throw new Error(`Insufficient leave quota. Remaining: ${employee.remainingLeave} days.`);
          }

          await tx.employee.update({
            where: { id: leave.employeeId },
            data: { remainingLeave: { decrement: diffDays } }
          });
        }

        // Mapping leave type to database AttStatus enum
        const statusMap = {
          'CUTI': 'CUTI',
          'SAKIT': 'SAKIT',
          'IZIN': 'IZIN'
        };
        const attStatus = statusMap[leave.type.toUpperCase()] || 'IZIN';

        let curr = new Date(start);
        while (curr <= end) {
          const dateKey = new Date(curr);
          dateKey.setHours(0, 0, 0, 0);

          const existingAtt = await tx.attendance.findUnique({
            where: { 
              employeeId_date: { 
                employeeId: leave.employeeId, 
                date: dateKey 
              } 
            }
          });

          const attData = {
            status: attStatus,
            mode: 'Leave System',
            notes: `Approved ${leave.type}: ${leave.reason}`
          };

          if (existingAtt) {
            await tx.attendance.update({
              where: { id: existingAtt.id },
              data: attData
            });
          } else {
            await tx.attendance.create({
              data: {
                ...attData,
                employeeId: leave.employeeId,
                date: dateKey
              }
            });
          }

          curr.setDate(curr.getDate() + 1);
        }
      }

      return result;
    });

    // Notify employee (outside transaction — non-critical)
    await prisma.notification.create({
      data: {
        employeeId: leave.employeeId,
        title: `Leave Request ${status}`,
        message: `Your ${leave.type} request for ${leave.startDate.toLocaleDateString()} to ${leave.endDate.toLocaleDateString()} has been ${status.toLowerCase()}. ${reviewNote ? `Note: ${reviewNote}` : ''}`
      }
    });

    // Send Push Notification
    try {
      const pushService = require('../services/pushNotificationService');
      const statusText = status === 'APPROVED' ? 'Disetujui' : 'Ditolak';
      const noteText = reviewNote ? ` Catatan: ${reviewNote}` : '';
      const formattedStart = new Date(leave.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const formattedEnd = new Date(leave.endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const dateStr = formattedStart === formattedEnd ? formattedStart : `${formattedStart} - ${formattedEnd}`;
      
      await pushService.sendPushNotification(
        leave.employeeId,
        `Pengajuan Cuti ${statusText}`,
        `Pengajuan ${leave.type} Anda (${dateStr}) telah ${statusText.toLowerCase()}.${noteText}`
      );
    } catch (pushErr) {
      console.error('[Push Notification Error] Failed to send push in leave review:', pushErr);
    }

    // Kirim notifikasi WhatsApp
    if (leave.employee && leave.employee.phone) {
      const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      };
      
      const startStr = formatDate(leave.startDate);
      const endStr = formatDate(leave.endDate);
      const dateRange = startStr === endStr ? startStr : `${startStr} s.d. ${endStr}`;
      
      const waMsg = `*Smart HRIS Platform - Leave Request Update*\n\n` +
        `Halo ${leave.employee.name},\n\n` +
        `Pengajuan cuti/izin Anda:\n` +
        `• Jenis: ${leave.type}\n` +
        `• Tanggal: ${dateRange}\n` +
        `• Alasan: ${leave.reason}\n` +
        `• Status: *${status === 'APPROVED' ? 'DISETUJUI' : 'DITOLAK'}*\n` +
        (reviewNote ? `• Catatan Peninjau: ${reviewNote}\n` : '') +
        `\nTerima kasih,\nTim HRD Smart HRIS Platform`;
      
      sendWAMessage(leave.employee.phone, waMsg).catch(err => {
        console.error('[LeaveController] Failed to send WA notification:', err);
      });
    }

    res.json({ success: true, message: `Request ${status.toLowerCase()} successfully`, data: mapLeaveRequest(updated) });
  } catch (err) {
    handleControllerError(res, err, 'leaveController');
  }
};

/**
 * POST /api/leave/mass
 * Admin applies leave to all employees (e.g., Eid Leave)
 */
const massApply = async (req, res) => {
  try {
    const { startDate, endDate, type, reason, deductQuota = false } = req.body;

    if (!startDate || !endDate || !type || !reason) {
      return res.status(400).json({ success: false, message: 'Start date, end date, type, and reason are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date.' });
    }

    // Calculate duration
    const diffTime = end - start;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 30) {
      return res.status(400).json({ success: false, message: 'Mass leave duration cannot exceed 30 days to prevent buffer overflow.' });
    }

    const employees = await prisma.employee.findMany({ 
      where: { 
        status: 'ACTIVE',
        employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] },
        salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] }
      } 
    });

    // Transaction for safety
    await prisma.$transaction(async (tx) => {
      // 1. Save Mass Leave Event Record
      await tx.massLeave.create({
        data: {
          startDate: start,
          endDate: end,
          type,
          reason
        }
      });

      for (const emp of employees) {
        // 1. Deduct Quota if needed
        if (deductQuota && type === 'Cuti') {
          if (emp.remainingLeave >= diffDays) {
            await tx.employee.update({
              where: { id: emp.id },
              data: { remainingLeave: { decrement: diffDays } }
            });
          }
        }

        // 2. Create Attendance Records
        let curr = new Date(start);
        while (curr <= end) {
          const dateKey = new Date(curr);
          dateKey.setHours(0, 0, 0, 0);

          await tx.attendance.upsert({
            where: { employeeId_date: { employeeId: emp.id, date: dateKey } },
            update: {
              status: type.toUpperCase() === 'CUTI' ? 'CUTI' : 'HOLIDAY',
              mode: 'Mass Leave',
              notes: `[Mass Leave] ${reason}`
            },
            create: {
              employeeId: emp.id,
              date: dateKey,
              status: type.toUpperCase() === 'CUTI' ? 'CUTI' : 'HOLIDAY',
              mode: 'Mass Leave',
              notes: `[Mass Leave] ${reason}`
            }
          });

          curr.setDate(curr.getDate() + 1);
        }
      }
    });

    res.json({ success: true, message: `Mass leave applied to ${employees.length} employees.` });
  } catch (err) {
    console.error('Mass leave error:', err);
    handleControllerError(res, err, 'leaveController');
  }
};

/**
 * GET /api/leave/mass
 * Admin lists all mass leave events
 */
const getMassLeaves = async (req, res) => {
  try {
    const list = await prisma.massLeave.findMany({
      orderBy: { startDate: 'desc' }
    });
    res.json({ success: true, data: list });
  } catch (err) {
    handleControllerError(res, err, 'leaveController');
  }
};

/**
 * PUT /api/leave/:id/cancel
 * Employee cancels their own pending leave request
 */
const cancelLeave = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const leave = await prisma.leaveRequest.findUnique({ where: { id } });

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    if (leave.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Only pending leave requests can be cancelled' });
    }

    if (leave.employeeId !== req.user.employeeId) {
      return res.status(403).json({ success: false, message: 'You can only cancel your own leave requests' });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    res.json({ success: true, message: 'Leave request cancelled successfully', data: mapLeaveRequest(updated) });
  } catch (err) {
    handleControllerError(res, err, 'leaveController');
  }
};

module.exports = { create, getAll, getByEmployee, review, massApply, getMassLeaves, cancelLeave };
