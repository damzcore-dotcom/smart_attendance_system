const prisma = require('../prismaClient');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { recordAuditLog } = require('./auditLogController');
const { validateSafePath, handleControllerError } = require('../middleware/validate');

// Configure disk storage for Multer
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
    cb(null, 'doc-' + req.params.id + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file tidak didukung. Harap unggah PDF, Word, atau Gambar.'));
    }
  }
});

/**
 * Upload document for employee
 */
const uploadDocument = async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    const { name, expiryDate, physicalLocator } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Harap sertakan file dokumen.' });
    }

    if (!name) {
      // Clean up uploaded file if name is missing
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ success: false, message: 'Nama dokumen harus diisi.' });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan.' });
    }

    const fileUrl = `/uploads/documents/${req.file.filename}`;

    const document = await prisma.employeeDocument.create({
      data: {
        employeeId,
        name,
        fileUrl,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        physicalLocator: physicalLocator || null
      }
    });

    // Record audit log
    if (req.user) {
      await recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'CREATE',
        entity: 'EmployeeDocument',
        entityId: document.id,
        details: JSON.stringify({
          employeeName: employee.name,
          documentName: name,
          fileUrl,
          physicalLocator
        }),
        ipAddress: req.ip
      });
    }

    res.status(201).json({ success: true, message: 'Dokumen berhasil diunggah.', data: document });
  } catch (err) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return handleControllerError(res, err, 'DocumentController.uploadDocument');
  }
};

/**
 * Get all documents for employee
 */
const getDocuments = async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    const documents = await prisma.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: documents });
  } catch (err) {
    return handleControllerError(res, err, 'DocumentController.getDocuments');
  }
};

/**
 * Delete a specific document
 */
const deleteDocument = async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const document = await prisma.employeeDocument.findUnique({
      where: { id: docId },
      include: { employee: true }
    });

    if (!document) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });
    }

    // Delete physical file (with path traversal protection)
    const { safe, resolvedPath } = validateSafePath(document.fileUrl);
    if (safe && fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }

    await prisma.employeeDocument.delete({ where: { id: docId } });

    // Record audit log
    if (req.user) {
      await recordAuditLog({
        userId: req.user.id,
        username: req.user.username,
        role: req.user.role,
        action: 'DELETE',
        entity: 'EmployeeDocument',
        entityId: docId,
        details: JSON.stringify({
          employeeName: document.employee.name,
          documentName: document.name,
          fileUrl: document.fileUrl
        }),
        ipAddress: req.ip
      });
    }

    res.json({ success: true, message: 'Dokumen berhasil dihapus.' });
  } catch (err) {
    return handleControllerError(res, err, 'DocumentController.deleteDocument');
  }
};

/**
 * Get upcoming PKWT contract expirations (within 30 days)
 */
const getContractAlerts = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0,0,0,0);
    const limitDate = new Date();
    limitDate.setDate(today.getDate() + 30);
    limitDate.setHours(23,59,59,999);

    const alerts = await prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        contractEnd: {
          not: null,
          gte: today,
          lte: limitDate
        }
      },
      include: { department: true },
      orderBy: { contractEnd: 'asc' }
    });

    res.json({
      success: true,
      data: alerts.map(emp => {
        const diffTime = new Date(emp.contractEnd) - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return {
          id: emp.id,
          employeeCode: emp.employeeCode,
          name: emp.name,
          department: emp.department?.name || '-',
          contractEnd: emp.contractEnd,
          daysRemaining: diffDays >= 0 ? diffDays : 0
        };
      })
    });
  } catch (err) {
    return handleControllerError(res, err, 'DocumentController.getContractAlerts');
  }
};

module.exports = {
  upload,
  uploadDocument,
  getDocuments,
  deleteDocument,
  getContractAlerts
};
