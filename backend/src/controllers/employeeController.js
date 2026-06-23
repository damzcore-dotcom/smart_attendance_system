const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const { recordAuditLog } = require('./auditLogController');

const { handleControllerError } = require('../middleware/validate');

const isBhl = (employmentStatus, salaryCategory) => {
  const bhlList = ['HARIAN', 'BHL', 'DAILY', 'DAILY WORKER', 'HARIAN LEPAS'];
  const status = String(employmentStatus || '').trim().toUpperCase();
  const category = String(salaryCategory || '').trim().toUpperCase();
  return bhlList.includes(status) || bhlList.includes(category);
};

const getAll = async (req, res) => {
  try {
    const { search, dept, section, position, status, empStatus, page = 1, limit = 20, sortBy = 'createdAt', order = 'desc', locationId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    const conditions = [];

    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ]
      });
    }
    if (dept && dept !== 'All') where.department = { name: dept };
    if (section && section !== 'All') where.section = section;
    if (position && position !== 'All') where.position = position;
    if (status && status !== 'All') where.status = status;
    if (empStatus && empStatus !== 'All') where.employmentStatus = empStatus;

    if (locationId && locationId !== 'All' && locationId !== '') {
      conditions.push({
        OR: [
          { locationId: { equals: locationId } },
          { locationId: { startsWith: `${locationId},` } },
          { locationId: { endsWith: `,${locationId}` } },
          { locationId: { contains: `,${locationId},` } }
        ]
      });
    }

    if (req.query.excludeBhl === 'true') {
      conditions.push({
        employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] }
      });
      conditions.push({
        salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] }
      });
    }

    if (req.query.onlyBhl === 'true') {
      conditions.push({
        OR: [
          { employmentStatus: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } },
          { salaryCategory: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } }
        ]
      });
    }

    if (req.query.noFingerprint === 'true') {
      conditions.push({
        OR: [
          { fingerPrintId: null },
          { fingerPrintId: '' }
        ]
      });
    }

    if (req.query.noFace === 'true') {
      conditions.push({
        OR: [
          { faceStatus: 'PENDING' },
          { faceId: null },
          { faceId: '' }
        ]
      });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    let orderBy = {};
    if (sortBy === 'dept') {
      orderBy = { department: { name: order } };
    } else {
      orderBy = { [sortBy]: order };
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: { department: true, shift: true, salary: true },
        skip,
        take: parseInt(limit),
        orderBy,
      }),
      prisma.employee.count({ where }),
    ]);

    const isLight = req.query.light === 'true';

    res.json({
      success: true,
      data: employees.map(emp => {
        const base = {
          id: emp.employeeCode,
          dbId: emp.id,
          name: emp.name,
          dept: emp.department?.name || 'No Dept',
          employeeCode: emp.employeeCode,
          department: emp.department,
          position: emp.position,
          section: emp.section,
          employmentStatus: emp.employmentStatus,
          salaryCategory: emp.salaryCategory,
          status: emp.status === 'ACTIVE' ? 'Active' : emp.status === 'ON_LEAVE' ? 'On Leave' : 'Terminated',
          dailyRate: emp.salary?.dailyRate || emp.salary?.baseSalary || 0,
        };

        if (isLight) return base;

        return {
          ...base,
          email: emp.email,
          phone: emp.phone,
          division: emp.division,
          locationId: emp.locationId,
          idNumber: emp.idNumber,
          cardNo: emp.cardNo,
          verifyCode: emp.verifyCode,
          grade: emp.grade,
          contractDuration: emp.contractDuration,
          joinDate: emp.joinDate,
          contractEnd: emp.contractEnd,
          terminationDate: emp.terminationDate,
          terminationReason: emp.terminationReason,
          fingerPrintId: emp.fingerPrintId,
          faceId: emp.faceId,
          faceStatus: emp.faceStatus,
          faceIdDisplay: emp.faceId || (emp.faceStatus === 'ENROLLED' ? 'Enrolled' : 'Pending'),
          facePhoto: emp.facePhoto,
          bpjsTk: emp.bpjsTk,
          bpjsKesehatan: emp.bpjsKesehatan,
          npwp: emp.npwp,
          ptkpStatus: emp.ptkpStatus,
          maritalStatus: emp.maritalStatus,
          kkNumber: emp.kkNumber,
          birthDate: emp.birthDate,
          birthPlace: emp.birthPlace,
          address: emp.address,
          education: emp.education,
          major: emp.major,
          religion: emp.religion,
          numberOfChildren: emp.numberOfChildren,
          fatherName: emp.fatherName,
          motherName: emp.motherName,
          spouseName: emp.spouseName,
          emergencyContact: emp.emergencyContact,
          notes: emp.notes,
          gender: emp.gender,
          bankName: emp.bankName,
          bankAccountNumber: emp.bankAccountNumber,
          profilePhoto: emp.profilePhoto,
          shift: emp.shift ? { id: emp.shift.id, name: emp.shift.name } : null,
          shiftId: emp.shiftId,
          leaveQuota: emp.leaveQuota,
          remainingLeave: emp.remainingLeave,
        };
      }),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const getById = async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { department: true, shift: true },
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: employee });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const create = async (req, res) => {
  try {
    const { name, email, dept, phone, position, ...rest } = req.body;
    if (!name || !email || !dept) return res.status(400).json({ success: false, message: 'Name, email, and department are required' });

    let department = await prisma.department.findUnique({ where: { name: dept } });
    if (!department) department = await prisma.department.create({ data: { name: dept } });

    // Auto-generate NIK based on last numeric sequence
    let employeeCode = rest.employeeCode?.trim();
    const isEmpHarian = isBhl(rest.employmentStatus, rest.salaryCategory);
    if (!employeeCode) {
      if (isEmpHarian) {
        const allBhl = await prisma.employee.findMany({ 
          where: { 
            OR: [
              { employmentStatus: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } },
              { salaryCategory: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } }
            ]
          }, 
          select: { employeeCode: true } 
        });
        const allBhlUsers = await prisma.user.findMany({
          where: { username: { startsWith: 'BHL-' } },
          select: { username: true }
        });
        
        let maxNum = 0;
        allBhl.forEach(emp => {
          const num = parseInt(emp.employeeCode.replace(/\D/g, ''));
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        allBhlUsers.forEach(u => {
          const num = parseInt(u.username.replace(/\D/g, ''));
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        
        employeeCode = `BHL-${String(maxNum + 1).padStart(4, '0')}`;
      } else {
        const allEmployees = await prisma.employee.findMany({ 
          where: { 
            AND: [
              { employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } },
              { salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } }
            ]
          },
          select: { employeeCode: true } 
        });
        const allUsers = await prisma.user.findMany({
          where: { NOT: { username: { startsWith: 'BHL-' } } },
          select: { username: true }
        });

        let maxNum = 0;
        allEmployees.forEach(emp => {
          const num = parseInt(emp.employeeCode.replace(/\D/g, ''));
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        allUsers.forEach(u => {
          const num = parseInt(u.username.replace(/\D/g, ''));
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        
        employeeCode = String(maxNum + 1);
      }
    }
    const defaultShift = await prisma.shift.findFirst();

    let profilePhotoUrl = rest.profilePhoto || null;
    if (rest.profilePhoto && rest.profilePhoto.startsWith('data:image')) {
      const base64Data = rest.profilePhoto.replace(/^data:image\/\w+;base64,/, "");
      const extMatch = rest.profilePhoto.split(';')[0].match(/jpeg|png|gif|webp/);
      const ext = extMatch ? extMatch[0] : 'jpg';
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profiles');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filename = `profile_${employeeCode}_${Date.now()}.${ext}`;
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, base64Data, 'base64');
      profilePhotoUrl = `/uploads/profiles/${filename}`;
    }

    // Map string dates if present
    const dataObj = {
      employeeCode, name, email, phone: phone || null, position: position || null,
      profilePhoto: profilePhotoUrl,
      departmentId: department.id,
      // Prioritize user-selected shift over system default
      shiftId: rest.shiftId ? parseInt(rest.shiftId) : (defaultShift?.id || null),
      division: rest.division, locationId: rest.locationId, idNumber: rest.idNumber, cardNo: rest.cardNo,
      contractDuration: rest.contractDuration, faceId: rest.faceId, facePhoto: rest.facePhoto, faceDescriptor: rest.faceDescriptor ? [JSON.parse(rest.faceDescriptor)] : null,
      faceStatus: rest.faceDescriptor ? 'ENROLLED' : 'PENDING',
      bpjsTk: rest.bpjsTk, bpjsKesehatan: rest.bpjsKesehatan,
      npwp: rest.npwp, ptkpStatus: rest.ptkpStatus, maritalStatus: rest.maritalStatus, kkNumber: rest.kkNumber, birthPlace: rest.birthPlace,
      address: rest.address, education: rest.education, major: rest.major, religion: rest.religion,
      numberOfChildren: rest.numberOfChildren ? parseInt(rest.numberOfChildren) : null,
      fatherName: rest.fatherName, motherName: rest.motherName, spouseName: rest.spouseName,
      emergencyContact: rest.emergencyContact, notes: rest.notes, 
      salaryCategory: rest.salaryCategory || 'UMK/UMR',
      employmentStatus: rest.employmentStatus || 'TETAP',
      gender: rest.gender || null,
      bankName: rest.bankName || null,
      bankAccountNumber: rest.bankAccountNumber || null,
      joinDate: rest.joinDate ? new Date(rest.joinDate) : null,
      contractEnd: rest.contractEnd ? new Date(rest.contractEnd) : null,
      birthDate: rest.birthDate ? new Date(rest.birthDate) : null,
      terminationDate: rest.terminationDate ? new Date(rest.terminationDate) : null,
      terminationReason: rest.terminationReason || null,
      leaveQuota: rest.leaveQuota ? parseInt(rest.leaveQuota) : 12,
      remainingLeave: rest.remainingLeave ? parseInt(rest.remainingLeave) : 12,
      status: rest.status ? (rest.status.toUpperCase() === 'TERMINATED' ? 'TERMINATED' : rest.status.toUpperCase() === 'ON_LEAVE' ? 'ON_LEAVE' : 'ACTIVE') : 'ACTIVE',
    };

    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({ data: dataObj, include: { department: true } });
      if (!isEmpHarian) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        await tx.user.create({ data: { username: employeeCode, password: hashedPassword, role: 'EMPLOYEE', employeeId: emp.id, mustChangePassword: true } });
      }
      return emp;
    });

    res.status(201).json({ success: true, message: 'Employee created successfully', data: employee });

    // Update face cache if face is enrolled
    if (employee.faceStatus === 'ENROLLED' && employee.faceDescriptor) {
      prisma.employee.findUnique({
        where: { id: employee.id },
        include: { department: true, shift: true, user: true }
      }).then(freshEmp => {
        if (freshEmp && freshEmp.user) {
          const { updateCachedFace } = require('../utils/faceCache');
          updateCachedFace(freshEmp.id, freshEmp.faceDescriptor, freshEmp);
        }
      }).catch(cacheErr => {
        console.error('Failed to update face cache on employee create:', cacheErr.message);
      });
    }

    // Audit log (fire-and-forget)
    if (req.user) {
      recordAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'CREATE', entity: 'Employee', entityId: employee.id, details: { name, employeeCode, dept }, ipAddress: req.ip });
    }
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ success: false, message: 'Email or ID already exists' });
    handleControllerError(res, err, 'employeeController');
  }
};

const update = async (req, res) => {
  try {
    const { name, email, dept, phone, position, status, faceStatus, faceDescriptor, ...rest } = req.body;
    const data = { ...rest };
    if (name) data.name = name;
    if (email) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (position !== undefined) data.position = position;
    if (status) {
      if (status.toUpperCase() === 'ACTIVE' || status === 'Active') data.status = 'ACTIVE';
      else if (status.toUpperCase() === 'ON_LEAVE' || status === 'On Leave') data.status = 'ON_LEAVE';
      else if (status.toUpperCase() === 'TERMINATED' || status === 'Terminated') data.status = 'TERMINATED';
    }
    if (faceStatus) {
      if (faceStatus.toUpperCase() === 'ENROLLED' || faceStatus === 'Enrolled') data.faceStatus = 'ENROLLED';
      else if (faceStatus.toUpperCase() === 'PENDING' || faceStatus === 'Pending') data.faceStatus = 'PENDING';
    }
    if (data.numberOfChildren) data.numberOfChildren = parseInt(data.numberOfChildren);
    if ('joinDate' in data) data.joinDate = data.joinDate ? new Date(data.joinDate) : null;
    if ('contractEnd' in data) data.contractEnd = data.contractEnd ? new Date(data.contractEnd) : null;
    if ('birthDate' in data) data.birthDate = data.birthDate ? new Date(data.birthDate) : null;
    if ('terminationDate' in data) data.terminationDate = data.terminationDate ? new Date(data.terminationDate) : null;
    if (faceDescriptor) {
      data.faceDescriptor = [JSON.parse(faceDescriptor)];
      data.faceStatus = 'ENROLLED';
    }
    // CCTV (InsightFace) enrollment: stamp the enrollment time so it matches the
    // bridge save path. Without this, faces enrolled through the UI had a null
    // faceEnrolledAt (PERBAIKAN_WAJAH_CCTV.md #2).
    if (data.faceEmbeddingV2) {
      data.faceEnrolledAt = new Date();
      data.faceStatus = 'ENROLLED';
    }
    if ('shiftId' in data) {
      data.shiftId = data.shiftId ? parseInt(data.shiftId) : null;
    }
    if (data.leaveQuota !== undefined) data.leaveQuota = parseInt(data.leaveQuota);
    if (data.remainingLeave !== undefined) data.remainingLeave = parseInt(data.remainingLeave);
    // Remove read-only fields and relation objects that shouldn't be updated directly
    delete data.employeeCode; delete data.dbId; delete data.id;
    delete data.shift; delete data.department; delete data.faceIdDisplay;
    delete data.dailyRate; // Not a schema field, comes from frontend salary form

    if (data.profilePhoto && data.profilePhoto.startsWith('data:image')) {
      const base64Data = data.profilePhoto.replace(/^data:image\/\w+;base64,/, "");
      const extMatch = data.profilePhoto.split(';')[0].match(/jpeg|png|gif|webp/);
      const ext = extMatch ? extMatch[0] : 'jpg';
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profiles');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      // Need employee Code for name, get it via params.id first, or just use timestamp
      const filename = `profile_upd_${req.params.id}_${Date.now()}.${ext}`;
      const filepath = path.join(uploadDir, filename);
      fs.writeFileSync(filepath, base64Data, 'base64');
      data.profilePhoto = `/uploads/profiles/${filename}`;
    }


    if (dept) {
      let department = await prisma.department.findUnique({ where: { name: dept } });
      if (!department) department = await prisma.department.create({ data: { name: dept } });
      data.departmentId = department.id;
    }

    const employee = await prisma.employee.update({
      where: { id: parseInt(req.params.id) },
      data,
      include: { department: true },
    });
    
    // Broadcast cache invalidation to AI Engine if face embedding was updated
    if (data.faceEmbeddingV2 || data.faceDescriptor || faceDescriptor) {
      const { reloadFaceCache } = require('../utils/aiEngine');
      reloadFaceCache();
    }

    res.json({ success: true, message: 'Employee updated', data: employee });

    // Update face cache if face is enrolled or removed
    if (employee.faceStatus === 'ENROLLED' && employee.faceDescriptor) {
      prisma.employee.findUnique({
        where: { id: employee.id },
        include: { department: true, shift: true, user: true }
      }).then(freshEmp => {
        if (freshEmp && freshEmp.user) {
          const { updateCachedFace } = require('../utils/faceCache');
          updateCachedFace(freshEmp.id, freshEmp.faceDescriptor, freshEmp);
        }
      }).catch(cacheErr => {
        console.error('Failed to update face cache on employee update:', cacheErr.message);
      });
    } else {
      const { removeCachedFace } = require('../utils/faceCache');
      removeCachedFace(employee.id);
    }

    // Audit log (fire-and-forget)
    if (req.user) {
      recordAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'UPDATE', entity: 'Employee', entityId: employee.id, details: { name: employee.name, updatedFields: Object.keys(data) }, ipAddress: req.ip });
    }
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const remove = async (req, res) => {
  try {
    await prisma.employee.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Employee deleted' });

    const { removeCachedFace } = require('../utils/faceCache');
    removeCachedFace(parseInt(req.params.id));

    // Audit log (fire-and-forget)
    if (req.user) {
      recordAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'DELETE', entity: 'Employee', entityId: parseInt(req.params.id), details: null, ipAddress: req.ip });
    }
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

global.importProgress = global.importProgress || {};

const importExcel = async (req, res) => {
  try {
    const jobId = req.query.jobId;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    
    if (jobId) global.importProgress[jobId] = 0;

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let employeesImported = 0;
    let employeesUpdated = 0;
    const totalRows = rawData.length;

    // Extract confirmConflicts and resolutions
    const confirmConflicts = req.body.confirmConflicts === 'true';
    const resolutions = req.body.resolutions ? JSON.parse(req.body.resolutions) : null;

    // PRE-FETCH DATA: Optimization to avoid N+1 Query problem (O(1) lookups)
    const existingEmployees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true, name: true, idNumber: true, fingerPrintId: true }
    });
    const existingNikMap = new Map();
    const existingNameMap = new Map();
    const existingKtpMap = new Map();
    const existingPinMap = new Map(); // Map: fingerPrintId -> Array of Employees

    existingEmployees.forEach(e => {
      if (e.employeeCode) {
        existingNikMap.set(e.employeeCode.trim(), e.id);
      }
      if (e.name) {
        existingNameMap.set(e.name.toLowerCase().trim(), e.id);
      }
      if (e.idNumber) {
        existingKtpMap.set(e.idNumber.trim(), e.id);
      }
      if (e.fingerPrintId) {
        const pin = e.fingerPrintId.trim();
        if (!existingPinMap.has(pin)) {
          existingPinMap.set(pin, []);
        }
        existingPinMap.get(pin).push(e);
      }
    });

    // First pass / dry-run: Check for PIN conflicts if confirmConflicts is false
    const conflictsMap = new Map();
    const processedInFileForConflictCheck = new Set();
    const ns = (val) => { const s = String(val || '').trim(); return s || null; };

    for (let i = 0; i < totalRows; i++) {
      const row = rawData[i];
      let empCode = String(row['NIK'] || row['Nik'] || row['nik'] || row['No.'] || row['Employee ID'] || '').trim();
      const name = String(row['Nama'] || row['Name'] || '').trim();

      const pinRaw = row['PIN'] !== undefined ? row['PIN'] :
                     row['Fingerprint ID'] !== undefined ? row['Fingerprint ID'] :
                     row['No. Mesin'] !== undefined ? row['No. Mesin'] :
                     row['AC No.'] !== undefined ? row['AC No.'] :
                     row['AC-No.'] !== undefined ? row['AC-No.'] :
                     row['ac-no.'] !== undefined ? row['ac-no.'] :
                     row['AC-No'] !== undefined ? row['AC-No'] :
                     row['ac-no'] !== undefined ? row['ac-no'] :
                     row['AC_No'] !== undefined ? row['AC_No'] :
                     row['ac_no'] !== undefined ? row['ac_no'] :
                     row['No. PIN'] !== undefined ? row['No. PIN'] :
                     row['FingerPrintId'] !== undefined ? row['FingerPrintId'] :
                     row['Fingerprint'] !== undefined ? row['Fingerprint'] :
                     row['fingerPrintId'] !== undefined ? row['fingerPrintId'] :
                     row['fingerprintId'];
      const pinVal = pinRaw !== undefined && pinRaw !== null && String(pinRaw).trim() !== '' ? String(pinRaw).trim() : null;

      if (!empCode && pinVal) {
        empCode = `TEMP_PIN_${pinVal}`;
      }

      if (!empCode || !name) continue;
      if (processedInFileForConflictCheck.has(empCode)) continue;
      processedInFileForConflictCheck.add(empCode);

      if (pinVal) {
        let existingId = existingNikMap.get(empCode);
        const ktpVal = ns(row['NIK KTP'] || row['ID Number']);
        if (!existingId && ktpVal) {
          existingId = existingKtpMap.get(ktpVal.trim());
        }
        if (!existingId && name) {
          existingId = existingNameMap.get(name.toLowerCase().trim());
        }

        // Temporary NIK upgrade check
        if (!existingId) {
          const empsWithPin = existingPinMap.get(pinVal) || [];
          const tempEmp = empsWithPin.find(e => e.employeeCode.startsWith('TEMP_PIN_'));
          if (tempEmp) {
            existingId = tempEmp.id;
          }
        }

        // Find conflicting employees in DB:
        const dbEmpsWithPin = existingPinMap.get(pinVal) || [];
        const conflictingEmps = dbEmpsWithPin.filter(e => e.id !== existingId);

        if (conflictingEmps.length > 0) {
          conflictingEmps.forEach(ce => {
            const conflictKey = `${pinVal}_${ce.id}`;
            if (!conflictsMap.has(conflictKey)) {
              conflictsMap.set(conflictKey, {
                pin: pinVal,
                excelEmployeeName: name,
                excelEmployeeNik: empCode,
                dbEmployeeName: ce.name,
                dbEmployeeNik: ce.employeeCode,
                dbEmployeeId: ce.id
              });
            }
          });
        }
      }
    }

    if (!confirmConflicts && conflictsMap.size > 0) {
      return res.json({
        success: true,
        needsConfirmation: true,
        conflicts: Array.from(conflictsMap.values())
      });
    }

    // Pre-fetch existing usernames to prevent unique constraint violations
    const existingUsers = await prisma.user.findMany({ select: { username: true } });
    const existingUsernameSet = new Set(existingUsers.map(u => u.username.trim()));

    // Track NIK yang sudah diproses dalam file ini (mencegah duplikat dalam 1 file)
    const processedInFile = new Set();

    const existingDepts = await prisma.department.findMany();
    const deptMap = new Map();
    existingDepts.forEach(d => deptMap.set(d.name.toLowerCase().trim(), d.id));

    const bhlWageSetting = await prisma.settings.findUnique({ where: { key: 'bhlDefaultDailyWage' } });
    const defaultBhlWage = bhlWageSetting ? parseFloat(bhlWageSetting.value) || 150000 : 150000;

    const errors = [];
    const warnings = [];

    // Helper: konversi Excel Serial Number ke Date
    const parseExcelDate = (val) => {
      if (!val) return null;
      if (typeof val === 'number') {
        const jsDate = new Date((val - 25569) * 86400000);
        return isNaN(jsDate.getTime()) ? null : jsDate;
      }
      const str = String(val).trim();
      if (!str) return null;
      const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (ddmmyyyy) {
        const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}`);
        return isNaN(d.getTime()) ? null : d;
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    };

    for (let i = 0; i < totalRows; i++) {
      const row = rawData[i];
      if (jobId && i % 5 === 0) {
        global.importProgress[jobId] = Math.round((i / totalRows) * 100);
      }

      let empCode = String(row['NIK'] || row['Nik'] || row['nik'] || row['No.'] || row['Employee ID'] || '').trim();
      const name = String(row['Nama'] || row['Name'] || '').trim();

      const pinRaw = row['PIN'] !== undefined ? row['PIN'] :
                     row['Fingerprint ID'] !== undefined ? row['Fingerprint ID'] :
                     row['No. Mesin'] !== undefined ? row['No. Mesin'] :
                     row['AC No.'] !== undefined ? row['AC No.'] :
                     row['AC-No.'] !== undefined ? row['AC-No.'] :
                     row['ac-no.'] !== undefined ? row['ac-no.'] :
                     row['AC-No'] !== undefined ? row['AC-No'] :
                     row['ac-no'] !== undefined ? row['ac-no'] :
                     row['AC_No'] !== undefined ? row['AC_No'] :
                     row['ac_no'] !== undefined ? row['ac_no'] :
                     row['No. PIN'] !== undefined ? row['No. PIN'] :
                     row['FingerPrintId'] !== undefined ? row['FingerPrintId'] :
                     row['Fingerprint'] !== undefined ? row['Fingerprint'] :
                     row['fingerPrintId'] !== undefined ? row['fingerPrintId'] :
                     row['fingerprintId'];
      const pinVal = pinRaw !== undefined && pinRaw !== null && String(pinRaw).trim() !== '' ? String(pinRaw).trim() : null;

      if (!empCode && pinVal) {
        empCode = `TEMP_PIN_${pinVal}`;
      }

      if (!empCode || !name) continue;

      // Cegah duplikat dalam 1 file
      if (processedInFile.has(empCode)) continue;
      processedInFile.add(empCode);

      try {
        const ns = (val) => { const s = String(val || '').trim(); return s || null; };

        // ── CHECK MULTI-KRITERIA: Cari karyawan lama di database ──
        let existingId = existingNikMap.get(empCode);

        // Cari lewat NIK KTP jika belum ketemu
        const ktpVal = ns(row['NIK KTP'] || row['ID Number']);
        if (!existingId && ktpVal) {
          existingId = existingKtpMap.get(ktpVal.trim());
        }

        // Cari lewat Nama jika belum ketemu
        if (!existingId && name) {
          existingId = existingNameMap.get(name.toLowerCase().trim());
        }

        // Jika NIK resmi baru diunggah untuk PIN yang memiliki NIK sementara, upgrade NIK di DB
        if (!existingId && pinVal) {
          const empWithSamePin = await prisma.employee.findFirst({
            where: {
              fingerPrintId: pinVal,
              employeeCode: { startsWith: 'TEMP_PIN_' }
            }
          });
          if (empWithSamePin) {
            existingId = empWithSamePin.id;
            console.log(`Upgrading temporary NIK ${empWithSamePin.employeeCode} to official NIK ${empCode} for employee: ${name}`);
            await prisma.employee.update({
              where: { id: existingId },
              data: { employeeCode: empCode }
            });
            existingNikMap.set(empCode, existingId);
          }
        }

        // Resolve department
        let deptName = String(row['Departemen'] || row['Department'] || 'General').trim();
        let deptKey = deptName.toLowerCase();
        let departmentId = deptMap.get(deptKey);
        if (!departmentId) {
          const newDept = await prisma.department.create({ data: { name: deptName } });
          departmentId = newDept.id;
          deptMap.set(deptKey, departmentId);
        }

        const empStatusStr = ns(row['Status Kerja']);
        const salaryCatStr = ns(row['Kategori Gaji']);
        const isHarian = ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'].includes(empStatusStr) ||
                         ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'].includes(salaryCatStr);

        // Bersihkan PIN dari karyawan lain jika ada konflik
        let activePinVal = pinVal;
        if (activePinVal) {
          const conflictingEmps = await prisma.employee.findMany({
            where: {
              fingerPrintId: activePinVal,
              id: { not: existingId }
            },
            select: { employeeCode: true, name: true }
          });

          if (conflictingEmps.length > 0) {
            const resType = resolutions ? resolutions[activePinVal] : null;
            if (resType === 'ignore') {
              conflictingEmps.forEach(ce => {
                warnings.push({
                  type: 'PIN_CONFLICT_IGNORED',
                  pin: activePinVal,
                  message: `PIN ${activePinVal} untuk ${name} (NIK: ${empCode}) diabaikan karena tetap digunakan oleh ${ce.name} (NIK: ${ce.employeeCode}).`
                });
              });
              activePinVal = null;
            } else {
              conflictingEmps.forEach(ce => {
                warnings.push({
                  type: 'PIN_CONFLICT_OVERWRITTEN',
                  pin: activePinVal,
                  message: `PIN ${activePinVal} dipindahkan ke ${name} (NIK: ${empCode}) dari karyawan lama ${ce.name} (NIK: ${ce.employeeCode}). PIN lama dikosongkan.`
                });
              });
              await prisma.employee.updateMany({
                where: {
                  fingerPrintId: activePinVal,
                  id: { not: existingId }
                },
                data: { fingerPrintId: null }
              });
            }
          }
        }

        // Build data object (hanya memasukkan kolom yang ada di file Excel)
        const empData = {
          name,
          departmentId
        };

        const addIfPresent = (dbKey, excelKeys) => {
          for (const key of excelKeys) {
            if (row[key] !== undefined) {
              empData[dbKey] = ns(row[key]);
              return;
            }
          }
        };

        addIfPresent('grade', ['Grade']);
        addIfPresent('position', ['Jabatan', 'Position']);
        addIfPresent('section', ['Bagian']);
        addIfPresent('employmentStatus', ['Status Kerja']);
        addIfPresent('contractDuration', ['Lama Kontrak']);
        addIfPresent('bpjsTk', ['BPJS TK']);
        addIfPresent('bpjsKesehatan', ['BPJS Kesehatan']);
        addIfPresent('npwp', ['NPWP']);
        addIfPresent('ptkpStatus', ['Status PTKP (Pajak)']);
        addIfPresent('kkNumber', ['No Kartu Keluarga']);
        addIfPresent('idNumber', ['NIK KTP', 'ID Number']);
        addIfPresent('birthPlace', ['Tempat Lahir']);
        addIfPresent('address', ['Alamat']);
        addIfPresent('education', ['Pendidikan Terakhir']);
        addIfPresent('major', ['Jurusan']);
        addIfPresent('religion', ['Agama']);
        addIfPresent('phone', ['No HP']);
        addIfPresent('fatherName', ['Nama Ayah Kandung']);
        addIfPresent('motherName', ['Nama Ibu Kandung']);
        addIfPresent('spouseName', ['Nama Suami/Istri']);
        addIfPresent('emergencyContact', ['KONTAK DARURAT']);
        addIfPresent('notes', ['Keterangan']);
        addIfPresent('gender', ['Jenis Kelamin']);
        addIfPresent('bankName', ['Nama Bank']);
        addIfPresent('bankAccountNumber', ['Nomor Rekening']);

        if (row['Jumlah Anak'] !== undefined) {
          const val = parseInt(row['Jumlah Anak']);
          empData.numberOfChildren = isNaN(val) ? null : val;
        }

        if (row['Kategori Gaji'] !== undefined || isHarian) {
          empData.salaryCategory = isHarian ? 'HARIAN' : (ns(row['Kategori Gaji']) || 'UMK/UMR');
        }

        const joinDate = parseExcelDate(row['Tanggal Masuk']);
        const contractEnd = parseExcelDate(row['Sisa Tanggal Kontrak']);
        const birthDate = parseExcelDate(row['Tanggal Lahir']);

        if (row['Tanggal Masuk'] !== undefined) empData.joinDate = joinDate;
        if (row['Sisa Tanggal Kontrak'] !== undefined) empData.contractEnd = contractEnd;
        if (row['Tanggal Lahir'] !== undefined) empData.birthDate = birthDate;

        if (existingId) {
          // HANYA update fingerPrintId jika activePinVal dari Excel bernilai valid (tidak null)
          if (activePinVal !== null) {
            empData.fingerPrintId = activePinVal;
          }
          
          // Sinkronkan NIK jika karyawan ditemukan berdasarkan KTP/Nama namun NIK-nya diperbarui
          empData.employeeCode = empCode;
          
          // ═══ UPDATE existing employee ═══
          await prisma.employee.update({
            where: { id: existingId },
            data: empData
          });
          employeesUpdated++;
        } else {
          // ═══ CREATE new employee ═══
          empData.employeeCode = empCode;
          empData.email = ns(row['Email']) || `${empCode.toLowerCase()}@company.com`;
          // Set fingerPrintId untuk karyawan baru (bisa null atau valid PIN)
          empData.fingerPrintId = activePinVal;

          const newEmployee = await prisma.employee.create({ data: empData });
          existingNikMap.set(empCode, newEmployee.id);
          
          if (isHarian) {
            const rawWage = row['Upah Harian'] || row['Gaji Harian'] || row['Daily Rate'] || row['Daily Wage'] || row['Upah'];
            const dailyRateVal = rawWage ? parseFloat(String(rawWage).replace(/[^\d]/g, '')) || defaultBhlWage : defaultBhlWage;
            await prisma.employeeSalary.create({
              data: {
                employeeId: newEmployee.id,
                employmentType: 'HARIAN',
                salaryType: 'DAILY',
                dailyRate: dailyRateVal,
                baseSalary: dailyRateVal
              }
            });
          } else {
            if (!existingUsernameSet.has(empCode)) {
              const hashedPassword = await bcrypt.hash('password123', 10);
              await prisma.user.create({
                data: { username: empCode, password: hashedPassword, role: 'EMPLOYEE', employeeId: newEmployee.id, mustChangePassword: true }
              });
              existingUsernameSet.add(empCode);
            }
          }
          
          employeesImported++;
        }
      } catch (rowErr) {
        console.error(`[Import] Error on row ${i + 2} (NIK: ${empCode}):`, rowErr.message);
        errors.push({ row: i + 2, nik: empCode, name, error: rowErr.message });
        continue;
      }
    }

    if (jobId) {
      global.importProgress[jobId] = 100;
      setTimeout(() => delete global.importProgress[jobId], 10000);
    }

    const parts = [];
    if (employeesImported > 0) parts.push(`${employeesImported} karyawan baru ditambahkan`);
    if (employeesUpdated > 0) parts.push(`${employeesUpdated} karyawan diperbarui`);
    if (warnings.length > 0) parts.push(`${warnings.length} konflik PIN diselesaikan`);
    if (errors.length > 0) parts.push(`${errors.length} baris gagal`);
    
    res.json({ 
      success: true, 
      message: `Import selesai: ${parts.join(', ')}.`,
      data: {
        imported: employeesImported,
        updated: employeesUpdated,
        total: totalRows,
        errors: errors.slice(0, 20),
        warnings: warnings.slice(0, 50)
      }
    });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const getProgress = (req, res) => {
  const jobId = req.query.jobId;
  const progress = global.importProgress[jobId] || 0;
  res.json({ success: true, progress });
};

const getMasterOptions = async (req, res) => {
  try {
    const { dept } = req.query;
    const where = {};
    if (dept && dept !== 'All') {
      where.department = { name: dept };
    }

    const [grades, positions, sections, statuses, durations, departments] = await Promise.all([
      prisma.employee.findMany({ where, select: { grade: true }, distinct: ['grade'] }),
      prisma.employee.findMany({ where, select: { position: true }, distinct: ['position'] }),
      prisma.employee.findMany({ where, select: { section: true }, distinct: ['section'] }),
      prisma.employee.findMany({ where, select: { employmentStatus: true }, distinct: ['employmentStatus'] }),
      prisma.employee.findMany({ where, select: { contractDuration: true }, distinct: ['contractDuration'] }),
      prisma.department.findMany({ select: { id: true, name: true } })
    ]);

    res.json({
      success: true,
      data: {
        grades: grades.map(g => g.grade).filter(Boolean),
        positions: positions.map(p => p.position).filter(Boolean),
        sections: sections.map(s => s.section).filter(Boolean),
        employmentStatuses: statuses.map(s => s.employmentStatus).filter(Boolean),
        contractDurations: durations.map(d => d.contractDuration).filter(Boolean),
        departments: departments.filter(d => d.name)
      }
    });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

/**
 * PUT /api/employees/batch-shift
 * Update shift for all employees in a department
 */
const batchUpdateShift = async (req, res) => {
  try {
    const { departmentId, shiftId } = req.body;
    
    if (!shiftId) {
      return res.status(400).json({ success: false, message: 'Shift is required' });
    }

    const where = {};
    if (departmentId && parseInt(departmentId) !== 0) {
      where.departmentId = parseInt(departmentId);
    }

    const result = await prisma.employee.updateMany({
      where,
      data: { shiftId: parseInt(shiftId) },
    });

    res.json({ 
      success: true, 
      message: departmentId && parseInt(departmentId) !== 0 
        ? `Updated shift for ${result.count} employees in department`
        : `Updated shift for all ${result.count} employees across all departments`,
      data: result 
    });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const checkDuplicate = async (req, res) => {
  try {
    const { nik } = req.query;
    if (!nik) return res.json({ success: true, isDuplicate: false });
    
    const count = await prisma.employee.count({ where: { employeeCode: String(nik) } });
    res.json({ success: true, isDuplicate: count > 0 });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const getNextFingerId = async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        NOT: [
          { fingerPrintId: null },
          { fingerPrintId: '' }
        ]
      },
      select: {
        fingerPrintId: true
      }
    });

    let maxId = 0;
    for (const emp of employees) {
      const num = parseInt(emp.fingerPrintId, 10);
      if (!isNaN(num)) {
        if (num > maxId) {
          maxId = num;
        }
      }
    }

    const nextId = maxId > 0 ? maxId + 1 : 10001;
    res.json({ success: true, nextFingerId: String(nextId) });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const batchUpdateSalaryCategory = async (req, res) => {
  try {
    const { employeeIds, salaryCategory } = req.body;
    
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Employee IDs are required' });
    }

    if (!salaryCategory) {
      return res.status(400).json({ success: false, message: 'Salary Category is required' });
    }

    const result = await prisma.employee.updateMany({
      where: {
        id: { in: employeeIds.map(id => parseInt(id)) }
      },
      data: { salaryCategory },
    });

    res.json({ 
      success: true, 
      message: `Updated salary category for ${result.count} employees`,
      data: result 
    });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

const getNextEmployeeCode = async (req, res) => {
  try {
    const { employmentStatus, salaryCategory } = req.query;
    const isEmpHarian = isBhl(employmentStatus, salaryCategory);
    
    let nextNik = '';
    if (isEmpHarian) {
      const allBhl = await prisma.employee.findMany({ 
        where: { 
          OR: [
            { employmentStatus: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } },
            { salaryCategory: { in: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } }
          ]
        }, 
        select: { employeeCode: true } 
      });
      const allBhlUsers = await prisma.user.findMany({
        where: { username: { startsWith: 'BHL-' } },
        select: { username: true }
      });
      
      let maxNum = 0;
      allBhl.forEach(emp => {
        const num = parseInt(emp.employeeCode.replace(/\D/g, ''));
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      allBhlUsers.forEach(u => {
        const num = parseInt(u.username.replace(/\D/g, ''));
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      
      nextNik = `BHL-${String(maxNum + 1).padStart(4, '0')}`;
    } else {
      const allEmployees = await prisma.employee.findMany({ 
        where: { 
          AND: [
            { employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } },
            { salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily', 'Bhl', 'DAILY WORKER', 'Harian Lepas'] } }
          ]
        },
        select: { employeeCode: true } 
      });
      const allUsers = await prisma.user.findMany({
        where: { NOT: { username: { startsWith: 'BHL-' } } },
        select: { username: true }
      });

      let maxNum = 0;
      allEmployees.forEach(emp => {
        const num = parseInt(emp.employeeCode.replace(/\D/g, ''));
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      allUsers.forEach(u => {
        const num = parseInt(u.username.replace(/\D/g, ''));
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      
      nextNik = String(maxNum + 1);
    }
    
    res.json({ success: true, nextNik });
  } catch (err) {
    handleControllerError(res, err, 'employeeController');
  }
};

module.exports = { getAll, getById, create, update, remove, importExcel, getProgress, getMasterOptions, batchUpdateShift, batchUpdateSalaryCategory, checkDuplicate, getNextFingerId, getNextEmployeeCode };
