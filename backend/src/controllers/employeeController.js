const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const { recordAuditLog } = require('./auditLogController');

const getAll = async (req, res) => {
  try {
    const { search, dept, section, position, status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dept && dept !== 'All') where.department = { name: dept };
    if (section && section !== 'All') where.section = section;
    if (position && position !== 'All') where.position = position;
    if (status && status !== 'All') where.status = status;

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: { department: true, shift: true },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.employee.count({ where }),
    ]);

    res.json({
      success: true,
      data: employees.map(emp => ({
        id: emp.employeeCode,
        dbId: emp.id,
        name: emp.name,
        dept: emp.department?.name || 'No Dept',
        email: emp.email,
        phone: emp.phone,
        position: emp.position,
        division: emp.division,
        locationId: emp.locationId,
        idNumber: emp.idNumber,
        cardNo: emp.cardNo,
        verifyCode: emp.verifyCode,
        grade: emp.grade,
        section: emp.section,
        employmentStatus: emp.employmentStatus,
        contractDuration: emp.contractDuration,
        joinDate: emp.joinDate,
        contractEnd: emp.contractEnd,
        faceId: emp.faceId || (emp.faceStatus === 'ENROLLED' ? 'Enrolled' : 'Pending'),
        facePhoto: emp.facePhoto,
        bpjsTk: emp.bpjsTk,
        bpjsKesehatan: emp.bpjsKesehatan,
        npwp: emp.npwp,
        ptkpStatus: emp.ptkpStatus,
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
        status: emp.status === 'ACTIVE' ? 'Active' : emp.status === 'ON_LEAVE' ? 'On Leave' : 'Terminated',
        shift: emp.shift ? { id: emp.shift.id, name: emp.shift.name } : null,
        shiftId: emp.shiftId,
        leaveQuota: emp.leaveQuota,
        remainingLeave: emp.remainingLeave,
      })),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    if (!employeeCode) {
      const allEmployees = await prisma.employee.findMany({ select: { employeeCode: true } });
      let maxNum = 0;
      allEmployees.forEach(emp => {
        const num = parseInt(emp.employeeCode.replace(/\D/g, ''));
        if (!isNaN(num) && num > maxNum) maxNum = num;
      });
      // Increment and keep it as a string
      employeeCode = String(maxNum + 1);
    }
    const defaultShift = await prisma.shift.findFirst();

    // Map string dates if present
    const dataObj = {
      employeeCode, name, email, phone: phone || null, position: position || null,
      departmentId: department.id,
      // Prioritize user-selected shift over system default
      shiftId: rest.shiftId ? parseInt(rest.shiftId) : (defaultShift?.id || null),
      division: rest.division, locationId: rest.locationId, idNumber: rest.idNumber, cardNo: rest.cardNo,
      verifyCode: rest.verifyCode, grade: rest.grade, section: rest.section, employmentStatus: rest.employmentStatus,
      contractDuration: rest.contractDuration, faceId: rest.faceId, facePhoto: rest.facePhoto, faceDescriptor: rest.faceDescriptor ? JSON.parse(rest.faceDescriptor) : null,
      bpjsTk: rest.bpjsTk, bpjsKesehatan: rest.bpjsKesehatan,
      npwp: rest.npwp, ptkpStatus: rest.ptkpStatus, kkNumber: rest.kkNumber, birthPlace: rest.birthPlace,
      address: rest.address, education: rest.education, major: rest.major, religion: rest.religion,
      numberOfChildren: rest.numberOfChildren ? parseInt(rest.numberOfChildren) : null,
      fatherName: rest.fatherName, motherName: rest.motherName, spouseName: rest.spouseName,
      emergencyContact: rest.emergencyContact, notes: rest.notes,
      joinDate: rest.joinDate ? new Date(rest.joinDate) : null,
      contractEnd: rest.contractEnd ? new Date(rest.contractEnd) : null,
      birthDate: rest.birthDate ? new Date(rest.birthDate) : null,
      leaveQuota: rest.leaveQuota ? parseInt(rest.leaveQuota) : 12,
      remainingLeave: rest.remainingLeave ? parseInt(rest.remainingLeave) : 12,
    };

    const employee = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({ data: dataObj, include: { department: true } });
      const hashedPassword = await bcrypt.hash('password123', 10);
      await tx.user.create({ data: { username: employeeCode, password: hashedPassword, role: 'EMPLOYEE', employeeId: emp.id } });
      return emp;
    });

    res.status(201).json({ success: true, message: 'Employee created successfully', data: employee });

    // Audit log (fire-and-forget)
    if (req.user) {
      recordAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'CREATE', entity: 'Employee', entityId: employee.id, details: { name, employeeCode, dept }, ipAddress: req.ip });
    }
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ success: false, message: 'Email or ID already exists' });
    res.status(500).json({ success: false, message: err.message });
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
    if (faceDescriptor) data.faceDescriptor = JSON.parse(faceDescriptor);
    if (data.shiftId) data.shiftId = parseInt(data.shiftId);
    if (data.leaveQuota !== undefined) data.leaveQuota = parseInt(data.leaveQuota);
    if (data.remainingLeave !== undefined) data.remainingLeave = parseInt(data.remainingLeave);
    // Remove read-only fields and relation objects that shouldn't be updated directly
    delete data.employeeCode; delete data.dbId; delete data.id;
    delete data.shift; delete data.department;

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
    res.json({ success: true, message: 'Employee updated', data: employee });

    // Audit log (fire-and-forget)
    if (req.user) {
      recordAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'UPDATE', entity: 'Employee', entityId: employee.id, details: { name: employee.name, updatedFields: Object.keys(data) }, ipAddress: req.ip });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await prisma.employee.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Employee deleted' });

    // Audit log (fire-and-forget)
    if (req.user) {
      recordAuditLog({ userId: req.user.id, username: req.user.username, role: req.user.role, action: 'DELETE', entity: 'Employee', entityId: parseInt(req.params.id), details: null, ipAddress: req.ip });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    let employeesSkipped = 0;
    const totalRows = rawData.length;

    for (let i = 0; i < totalRows; i++) {
      const row = rawData[i];
      // Update progress
      if (jobId && i % 5 === 0) {
        global.importProgress[jobId] = Math.round((i / totalRows) * 100);
      }

      // Support both NIK and No. headers
      const empCode = String(row['NIK'] || row['No.'] || row['Employee ID'] || '').trim();
      const name = String(row['Nama'] || row['Name'] || '').trim();
      
      if (!empCode || !name) continue;

      // Logic 1: Pengecekan NIK tunggal untuk menghindari duplikasi
      let employee = await prisma.employee.findUnique({ where: { employeeCode: empCode } });
      
      // Logic 2: Jika sudah ada, ABAIKAN (Skip) sesuai permintaan user
      if (employee) {
        employeesSkipped++;
        continue;
      }

      // Jika data baru, lanjutkan pendaftaran
      let deptName = String(row['Departemen'] || row['Department'] || 'General').trim();
      let department = await prisma.department.findUnique({ where: { name: deptName } });
      if (!department) department = await prisma.department.create({ data: { name: deptName } });

      const createData = {
        employeeCode: empCode,
        name,
        departmentId: department.id,
        grade: String(row['Grade'] || ''),
        position: String(row['Jabatan'] || row['Position'] || ''),
        section: String(row['Bagian'] || ''),
        employmentStatus: String(row['Status Kerja'] || ''),
        contractDuration: String(row['Lama Kontrak'] || ''),
        faceId: String(row['Face ID'] || ''),
        bpjsTk: String(row['BPJS TK'] || ''),
        bpjsKesehatan: String(row['BPJS Kesehatan'] || ''),
        npwp: String(row['NPWP'] || ''),
        ptkpStatus: String(row['Status PTKP (Pajak)'] || ''),
        kkNumber: String(row['No Kartu Keluarga'] || ''),
        idNumber: String(row['NIK KTP'] || row['ID Number'] || ''),
        birthPlace: String(row['Tempat Lahir'] || ''),
        address: String(row['Alamat'] || ''),
        education: String(row['Pendidikan Terakhir'] || ''),
        major: String(row['Jurusan'] || ''),
        religion: String(row['Agama'] || ''),
        phone: String(row['No HP'] || ''),
        numberOfChildren: row['Jumlah Anak'] ? parseInt(row['Jumlah Anak']) : null,
        fatherName: String(row['Nama Ayah Kandung'] || ''),
        motherName: String(row['Nama Ibu Kandung'] || ''),
        spouseName: String(row['Nama Suami/Istri'] || ''),
        emergencyContact: String(row['KONTAK DARURAT'] || ''),
        email: String(row['Email'] || `${empCode.toLowerCase()}@company.com`),
        notes: String(row['Keterangan'] || ''),
      };
      
      if (row['Tanggal Masuk']) createData.joinDate = new Date(row['Tanggal Masuk']);
      if (row['Sisa Tanggal Kontrak']) createData.contractEnd = new Date(row['Sisa Tanggal Kontrak']);
      if (row['Tanggal Lahir']) createData.birthDate = new Date(row['Tanggal Lahir']);

      const hashedPassword = await bcrypt.hash('password123', 10);
      const newEmployee = await prisma.employee.create({
        data: createData
      });
      
      await prisma.user.create({
        data: { username: empCode, password: hashedPassword, role: 'EMPLOYEE', employeeId: newEmployee.id }
      });
      
      employeesImported++;
    }

    if (jobId) {
      global.importProgress[jobId] = 100;
      setTimeout(() => delete global.importProgress[jobId], 10000);
    }

    res.json({ 
      success: true, 
      message: `Import selesai: ${employeesImported} karyawan baru ditambahkan, ${employeesSkipped} diabaikan (sudah terdaftar).`,
      data: {
        imported: employeesImported,
        skipped: employeesSkipped,
        total: totalRows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const checkDuplicate = async (req, res) => {
  try {
    const { nik } = req.query;
    if (!nik) return res.json({ success: true, isDuplicate: false });
    
    const count = await prisma.employee.count({ where: { employeeCode: String(nik) } });
    res.json({ success: true, isDuplicate: count > 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getAll, getById, create, update, remove, importExcel, getProgress, getMasterOptions, batchUpdateShift, checkDuplicate };
