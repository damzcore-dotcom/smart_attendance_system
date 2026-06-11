const prisma = require('../prismaClient');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { recordAuditLog } = require('./auditLogController');
const { validateSafePath, formatRupiah, handleControllerError } = require('../middleware/validate');
const { sendWAMessage } = require('../services/whatsappService');

// Configure disk storage for Multer (Receipts)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(process.cwd(), 'public', 'uploads', 'receipts');
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const empId = req.user.employeeId || 'admin';
    cb(null, 'receipt-' + empId + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file kuitansi tidak didukung. Harap unggah PDF atau Gambar.'));
    }
  }
});

/**
 * Submit a new reimbursement claim
 */
const createClaim = async (req, res) => {
  try {
    const { title, category, amount } = req.body;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Hanya akun karyawan yang dapat mengajukan klaim.' });
    }

    if (!title || !category || !amount) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Judul, kategori, dan nominal klaim harus diisi.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Harap sertakan foto kuitansi/bukti bayar.' });
    }

    const receiptUrl = `/uploads/receipts/${req.file.filename}`;
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Nominal klaim harus berupa angka lebih dari 0.' });
    }

    const claim = await prisma.reimbursementClaim.create({
      data: {
        employeeId,
        title,
        category,
        amount: parsedAmount,
        receiptUrl,
        status: 'PENDING'
      },
      include: {
        employee: {
          select: { name: true, employeeCode: true }
        }
      }
    });

    // Record audit log
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'CREATE',
      entity: 'ReimbursementClaim',
      entityId: claim.id,
      details: JSON.stringify({
        employeeName: claim.employee.name,
        title,
        amount: parsedAmount,
        category
      }),
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, message: 'Klaim reimbursement berhasil diajukan.', data: claim });
  } catch (err) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return handleControllerError(res, err, 'ClaimController.createClaim');
  }
};

/**
 * Get all claims with filters
 */
const getClaims = async (req, res) => {
  try {
    const { status, employeeId, category } = req.query;
    
    const where = {};
    
    // Authorization logic
    const isAdminOrAccounting = ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTING'].includes(req.user.role);
    const isManager = req.user.role === 'MANAGER';
    
    if (!isAdminOrAccounting && !isManager) {
      // Normal employee can only see their own claims
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
    
    if (category) {
      where.category = category;
    }

    const page = req.query.page ? parseInt(req.query.page) : null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    let pagination = null;
    let claims;

    if (page) {
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        prisma.reimbursementClaim.findMany({
          where,
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                employeeCode: true,
                department: { select: { name: true } }
              }
            },
            payroll: {
              select: { period: true, periodName: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.reimbursementClaim.count({ where })
      ]);
      claims = data;
      pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };
    } else {
      claims = await prisma.reimbursementClaim.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              department: { select: { name: true } }
            }
          },
          payroll: {
            select: { period: true, periodName: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json({ success: true, data: claims, pagination });
  } catch (err) {
    return handleControllerError(res, err, 'ClaimController.getClaims');
  }
};

/**
 * Review a claim (Approve / Reject)
 */
const reviewClaim = async (req, res) => {
  try {
    const claimId = parseInt(req.params.id);
    const { status, reviewNote } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status review tidak valid (harus APPROVED atau REJECTED).' });
    }

    const claim = await prisma.reimbursementClaim.findUnique({
      where: { id: claimId },
      include: { employee: true }
    });

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Klaim tidak ditemukan.' });
    }

    if (claim.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Klaim ini sudah ditinjau sebelumnya.' });
    }

    const updatedClaim = await prisma.reimbursementClaim.update({
      where: { id: claimId },
      data: {
        status,
        reviewNote: reviewNote || null
      }
    });

    // Record audit log
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'UPDATE',
      entity: 'ReimbursementClaim',
      entityId: claimId,
      details: JSON.stringify({
        employeeName: claim.employee.name,
        title: claim.title,
        oldStatus: claim.status,
        newStatus: status,
        reviewNote
      }),
      ipAddress: req.ip
    });

    // If approved, create a notification for the employee
    await prisma.notification.create({
      data: {
        employeeId: claim.employeeId,
        title: status === 'APPROVED' ? 'Klaim Reimbursement Disetujui' : 'Klaim Reimbursement Ditolak',
        message: `Pengajuan klaim "${claim.title}" sebesar Rp ${formatRupiah(claim.amount)} telah ${status === 'APPROVED' ? 'disetujui dan akan dicairkan pada slip gaji berikutnya' : 'ditolak. Alasan: ' + (reviewNote || '-')}`
      }
    });

    // Send Push Notification
    try {
      const pushService = require('../services/pushNotificationService');
      const statusText = status === 'APPROVED' ? 'Disetujui' : 'Ditolak';
      const formattedAmount = formatRupiah(claim.amount);
      const noteText = status === 'REJECTED' ? ` Alasan: ${reviewNote || '-'}` : ' Akan dicairkan pada slip gaji berikutnya.';
      
      await pushService.sendPushNotification(
        claim.employeeId,
        `Klaim Reimbursement ${statusText}`,
        `Klaim "${claim.title}" sebesar Rp ${formattedAmount} telah ${statusText.toLowerCase()}.${noteText}`
      );
    } catch (pushErr) {
      console.error('[Push Notification Error] Failed to send push in claim review:', pushErr);
    }

    // Kirim notifikasi WhatsApp
    if (claim.employee && claim.employee.phone) {
      const formattedAmount = formatRupiah(claim.amount);
      const waMsg = `*Smart HRIS Platform - Reimbursement Claim Update*\n\n` +
        `Halo ${claim.employee.name},\n\n` +
        `Pengajuan klaim Anda:\n` +
        `• Judul: ${claim.title}\n` +
        `• Nominal: Rp ${formattedAmount}\n` +
        `• Status: *${status === 'APPROVED' ? 'DISETUJUI' : 'DITOLAK'}*\n` +
        (status === 'REJECTED' ? `• Alasan: ${reviewNote || '-'}\n` : `• Keterangan: Akan dicairkan pada slip gaji berikutnya.\n`) +
        `\nTerima kasih,\nTim HRD Smart HRIS Platform`;
      
      sendWAMessage(claim.employee.phone, waMsg).catch(err => {
        console.error('[ClaimController] Failed to send WA notification:', err);
      });
    }

    res.json({ success: true, message: `Klaim berhasil di-${status.toLowerCase()}.`, data: updatedClaim });
  } catch (err) {
    return handleControllerError(res, err, 'ClaimController.reviewClaim');
  }
};

/**
 * Delete a claim (only pending claims)
 */
const deleteClaim = async (req, res) => {
  try {
    const claimId = parseInt(req.params.id);
    const claim = await prisma.reimbursementClaim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      return res.status(404).json({ success: false, message: 'Klaim tidak ditemukan.' });
    }

    // Security check: employee can only delete their own claims
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    if (!isAdmin && claim.employeeId !== req.user.employeeId) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki hak akses untuk menghapus klaim ini.' });
    }

    if (claim.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Hanya klaim yang berstatus PENDING yang dapat dihapus.' });
    }

    // Delete physical file (with path traversal protection)
    const { safe, resolvedPath } = validateSafePath(claim.receiptUrl);
    if (safe && fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }

    await prisma.reimbursementClaim.delete({
      where: { id: claimId }
    });

    res.json({ success: true, message: 'Klaim reimbursement berhasil dihapus.' });
  } catch (err) {
    return handleControllerError(res, err, 'ClaimController.deleteClaim');
  }
};

module.exports = {
  upload,
  createClaim,
  getClaims,
  reviewClaim,
  deleteClaim
};
