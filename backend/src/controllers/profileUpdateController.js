const prisma = require('../prismaClient');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { recordAuditLog } = require('./auditLogController');
const { handleControllerError } = require('../middleware/validate');

// Configure disk storage for Multer (Proof Documents)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dest = path.join(process.cwd(), 'public', 'uploads', 'documents');
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const empId = req.user.employeeId || 'admin';
    cb(null, 'profile-update-' + empId + '-' + uniqueSuffix + ext);
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
      cb(new Error('Format file dokumen pendukung tidak didukung. Harap unggah PDF atau Gambar.'));
    }
  }
});

// Allowed fields for ESS update
const ALLOWED_FIELDS = [
  'address',
  'phone',
  'maritalStatus',
  'numberOfChildren',
  'spouseName',
  'fatherName',
  'motherName',
  'emergencyContact',
  'religion',
  'education',
  'major'
];

/**
 * Submit profile update request
 */
const submitUpdateRequest = async (req, res) => {
  try {
    const { fieldName, newValue } = req.body;
    const employeeId = req.user.employeeId;

    if (!employeeId) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Hanya akun karyawan yang dapat mengajukan pembaruan profil.' });
    }

    if (!fieldName || newValue === undefined || newValue === null) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Nama field dan nilai baru wajib diisi.' });
    }

    if (!ALLOWED_FIELDS.includes(fieldName)) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Field profil ini tidak diizinkan untuk diubah secara mandiri.' });
    }

    // Get current value
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan.' });
    }

    const oldValue = employee[fieldName] !== null && employee[fieldName] !== undefined 
      ? String(employee[fieldName]) 
      : null;

    let documentUrl = null;
    if (req.file) {
      documentUrl = `/uploads/documents/${req.file.filename}`;
    }

    const request = await prisma.profileUpdateRequest.create({
      data: {
        employeeId,
        fieldName,
        oldValue,
        newValue: String(newValue),
        documentUrl,
        status: 'PENDING'
      },
      include: {
        employee: { select: { name: true, employeeCode: true } }
      }
    });

    res.status(201).json({ success: true, message: 'Pengajuan pembaruan profil berhasil dikirim ke HRD.', data: request });
  } catch (err) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return handleControllerError(res, err, 'ProfileUpdateController.submitUpdateRequest');
  }
};

/**
 * Get profile update requests
 */
const getUpdateRequests = async (req, res) => {
  try {
    const { status, employeeId } = req.query;
    const where = {};

    const isAdminOrAccounting = ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTING'].includes(req.user.role);
    if (!isAdminOrAccounting) {
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

    const page = req.query.page ? parseInt(req.query.page) : null;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    let pagination = null;
    let requests;

    if (page) {
      const skip = (page - 1) * limit;
      const [data, total] = await Promise.all([
        prisma.profileUpdateRequest.findMany({
          where,
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                employeeCode: true,
                department: { select: { name: true } }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.profileUpdateRequest.count({ where })
      ]);
      requests = data;
      pagination = {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };
    } else {
      requests = await prisma.profileUpdateRequest.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeCode: true,
              department: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json({ success: true, data: requests, pagination });
  } catch (err) {
    return handleControllerError(res, err, 'ProfileUpdateController.getUpdateRequests');
  }
};

/**
 * Review profile update request (Approve / Reject)
 */
const reviewUpdateRequest = async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, reviewNote } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status review tidak valid.' });
    }

    const request = await prisma.profileUpdateRequest.findUnique({
      where: { id: requestId },
      include: { employee: true }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Pengajuan tidak ditemukan.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Pengajuan ini sudah diproses sebelumnya.' });
    }

    if (status === 'APPROVED') {
      // Prepare employee update data
      const updateData = {};
      if (request.fieldName === 'numberOfChildren') {
        updateData[request.fieldName] = parseInt(request.newValue) || 0;
      } else {
        updateData[request.fieldName] = request.newValue;
      }

      // Execute transactionally
      await prisma.$transaction([
        prisma.profileUpdateRequest.update({
          where: { id: requestId },
          data: { status, reviewNote: reviewNote || null }
        }),
        prisma.employee.update({
          where: { id: request.employeeId },
          data: updateData
        })
      ]);

      // Record audit log
      await recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'UPDATE',
        entity: 'Employee',
        entityId: request.employeeId,
        details: JSON.stringify({
          employeeName: request.employee.name,
          fieldName: request.fieldName,
          oldValue: request.oldValue,
          newValue: request.newValue,
          note: 'Approved via Profile Update Request'
        }),
        ipAddress: req.ip
      });
    } else {
      // Just reject
      await prisma.profileUpdateRequest.update({
        where: { id: requestId },
        data: { status, reviewNote: reviewNote || null }
      });
    }

    // Create notification for employee
    await prisma.notification.create({
      data: {
        employeeId: request.employeeId,
        title: status === 'APPROVED' ? 'Pembaruan Profil Disetujui' : 'Pembaruan Profil Ditolak',
        message: `Pengajuan perubahan data "${request.fieldName}" menjadi "${request.newValue}" telah ${status === 'APPROVED' ? 'disetujui dan data profil Anda telah diperbarui' : 'ditolak. Alasan: ' + (reviewNote || '-')}`
      }
    });

    res.json({ success: true, message: `Pengajuan berhasil di-${status.toLowerCase()}.` });
  } catch (err) {
    return handleControllerError(res, err, 'ProfileUpdateController.reviewUpdateRequest');
  }
};

module.exports = {
  upload,
  submitUpdateRequest,
  getUpdateRequests,
  reviewUpdateRequest
};
