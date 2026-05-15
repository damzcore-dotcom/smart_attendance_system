const prisma = require('../prismaClient');
const { recordAuditLog } = require('./auditLogController');

// ─── Payroll Config (Key-Value) ──────────────────

const getConfig = async (req, res) => {
  try {
    const configs = await prisma.payrollConfig.findMany();
    const obj = {};
    configs.forEach(c => { obj[c.key] = c.value; });
    res.json({ success: true, data: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateConfig = async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await prisma.payrollConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    res.json({ success: true, message: 'Payroll config updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Salary Components ───────────────────────────

const getComponents = async (req, res) => {
  try {
    const components = await prisma.salaryComponent.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, data: components });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createComponent = async (req, res) => {
  try {
    const { name, type, isFixed, defaultValue, sortOrder, calculationType, isTaxable } = req.body;
    if (!name || !type) return res.status(400).json({ success: false, message: 'Name and type are required' });

    const component = await prisma.salaryComponent.create({
      data: {
        name,
        type, // ALLOWANCE or DEDUCTION
        isFixed: isFixed !== false,
        defaultValue: parseFloat(defaultValue) || 0,
        sortOrder: parseInt(sortOrder) || 0,
        calculationType: calculationType || 'FIXED_MONTHLY',
        isTaxable: isTaxable === true,
      },
    });
    res.status(201).json({ success: true, data: component });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ success: false, message: 'Component name already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateComponent = async (req, res) => {
  try {
    const { name, type, isFixed, defaultValue, isActive, sortOrder, calculationType, isTaxable } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type;
    if (isFixed !== undefined) data.isFixed = isFixed;
    if (defaultValue !== undefined) data.defaultValue = parseFloat(defaultValue);
    if (isActive !== undefined) data.isActive = isActive;
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder);
    if (calculationType !== undefined) data.calculationType = calculationType;
    if (isTaxable !== undefined) data.isTaxable = isTaxable;

    const component = await prisma.salaryComponent.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json({ success: true, data: component });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteComponent = async (req, res) => {
  try {
    await prisma.salaryComponent.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Component deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Overtime Rules ──────────────────────────────

const getOvertimeRules = async (req, res) => {
  try {
    const rules = await prisma.overtimeRule.findMany({
      orderBy: [{ dayType: 'asc' }, { hourFrom: 'asc' }],
    });
    res.json({ success: true, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createOvertimeRule = async (req, res) => {
  try {
    const { name, dayType, hourFrom, hourTo, multiplier } = req.body;
    if (!name || !dayType) return res.status(400).json({ success: false, message: 'Name and dayType are required' });

    const rule = await prisma.overtimeRule.create({
      data: {
        name,
        dayType,
        hourFrom: parseFloat(hourFrom) || 0,
        hourTo: parseFloat(hourTo) || 1,
        multiplier: parseFloat(multiplier) || 1.5,
      },
    });
    res.status(201).json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateOvertimeRule = async (req, res) => {
  try {
    const { name, dayType, hourFrom, hourTo, multiplier, isActive } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (dayType !== undefined) data.dayType = dayType;
    if (hourFrom !== undefined) data.hourFrom = parseFloat(hourFrom);
    if (hourTo !== undefined) data.hourTo = parseFloat(hourTo);
    if (multiplier !== undefined) data.multiplier = parseFloat(multiplier);
    if (isActive !== undefined) data.isActive = isActive;

    const rule = await prisma.overtimeRule.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json({ success: true, data: rule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteOvertimeRule = async (req, res) => {
  try {
    await prisma.overtimeRule.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Overtime rule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Employee Salary ─────────────────────────────

const getEmployeeSalaries = async (req, res) => {
  try {
    const { dept, type, search, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const empWhere = { status: 'ACTIVE' };
    if (dept && dept !== 'All') empWhere.department = { name: dept };
    if (search) {
      empWhere.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where: empWhere,
        include: {
          department: true,
          salary: true,
        },
        skip,
        take: parseInt(limit),
        orderBy: { name: 'asc' },
      }),
      prisma.employee.count({ where: empWhere }),
    ]);

    // Filter by employment type if specified
    let result = employees.map(emp => ({
      id: emp.id,
      employeeCode: emp.employeeCode,
      name: emp.name,
      dept: emp.department?.name || '-',
      position: emp.position || '-',
      grade: emp.grade || '-',
      section: emp.section || '-',
      employmentStatus: emp.employmentStatus || '-',
      salaryCategory: emp.salaryCategory || 'UMK/UMR',
      salary: emp.salary ? {
        id: emp.salary.id,
        employmentType: emp.salary.employmentType,
        salaryType: emp.salary.salaryType,
        baseSalary: emp.salary.baseSalary,
        dailyRate: emp.salary.dailyRate,
        components: emp.salary.components,
        contractNumber: emp.salary.contractNumber,
        contractStart: emp.salary.contractStart,
        contractEnd: emp.salary.contractEnd,
        contractDuration: emp.salary.contractDuration,
        contractRenewalCount: emp.salary.contractRenewalCount,
        minWorkingDays: emp.salary.minWorkingDays,
      } : null,
    }));

    if (type && type !== 'All') {
      result = result.filter(e => e.salary?.employmentType === type);
    }

    res.json({ success: true, data: result, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getEmployeeSalary = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);
    const salary = await prisma.employeeSalary.findUnique({
      where: { employeeId: empId },
      include: { employee: { include: { department: true } } },
    });

    if (!salary) {
      // Return employee info with no salary configured
      const emp = await prisma.employee.findUnique({
        where: { id: empId },
        include: { department: true },
      });
      if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
      return res.json({ success: true, data: { employee: emp, salary: null } });
    }

    res.json({ success: true, data: { employee: salary.employee, salary } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const setEmployeeSalary = async (req, res) => {
  try {
    const empId = parseInt(req.params.empId);
    const {
      employmentType, salaryType, baseSalary, components,
      contractNumber, contractStart, contractEnd, contractDuration, contractRenewalCount,
      dailyRate, minWorkingDays
    } = req.body;

    const data = {
      employmentType: employmentType || 'TETAP',
      salaryType: salaryType || 'MONTHLY',
      baseSalary: parseFloat(baseSalary) || 0,
      components: components || null,
      contractNumber: contractNumber || null,
      contractStart: contractStart ? new Date(contractStart) : null,
      contractEnd: contractEnd ? new Date(contractEnd) : null,
      contractDuration: contractDuration || null,
      contractRenewalCount: parseInt(contractRenewalCount) || 0,
      dailyRate: dailyRate ? parseFloat(dailyRate) : null,
      minWorkingDays: minWorkingDays ? parseInt(minWorkingDays) : null,
    };

    const salary = await prisma.employeeSalary.upsert({
      where: { employeeId: empId },
      update: data,
      create: { employeeId: empId, ...data },
    });

    // Also sync the Employee model's employment status for consistency
    let mappedStatus = 'Karyawan Tetap';
    if (data.employmentType === 'KONTRAK') mappedStatus = 'Karyawan Kontrak';
    if (data.employmentType === 'HARIAN') mappedStatus = 'Karyawan Harian Lepas';

    await prisma.employee.update({
      where: { id: empId },
      data: { employmentStatus: mappedStatus }
    });

    res.json({ success: true, message: 'Employee salary saved', data: salary });

    if (req.user) {
      recordAuditLog({
        userId: req.user.id, username: req.user.username, role: req.user.role,
        action: 'UPDATE', entity: 'EmployeeSalary', entityId: empId,
        details: { baseSalary: data.baseSalary, employmentType: data.employmentType },
        ipAddress: req.ip,
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const batchSetSalary = async (req, res) => {
  try {
    const { employeeIds, employmentType, salaryType, baseSalary, components, dailyRate, minWorkingDays } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Employee IDs are required' });
    }

    let updated = 0;
    for (const empId of employeeIds) {
      const data = {
        employmentType: employmentType || 'TETAP',
        salaryType: salaryType || 'MONTHLY',
        baseSalary: parseFloat(baseSalary) || 0,
        components: components || null,
        dailyRate: dailyRate ? parseFloat(dailyRate) : null,
        minWorkingDays: minWorkingDays ? parseInt(minWorkingDays) : null,
      };

      await prisma.employeeSalary.upsert({
        where: { employeeId: parseInt(empId) },
        update: data,
        create: { employeeId: parseInt(empId), ...data },
      });
      updated++;
    }

    res.json({ success: true, message: `Salary updated for ${updated} employees` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PKWT Alerts ─────────────────────────────────

const getPkwtAlerts = async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        employmentStatus: { in: ['KONTRAK', 'PKWT'] },
        contractEnd: { not: null },
        status: 'ACTIVE',
      },
      include: {
        department: true,
      },
      orderBy: { contractEnd: 'asc' },
    });

    const now = new Date();
    const alerts = employees.map(emp => {
      const daysLeft = Math.ceil((new Date(emp.contractEnd) - now) / (1000 * 60 * 60 * 24));
      let alertLevel = 'normal';
      if (daysLeft <= 0) alertLevel = 'expired';
      else if (daysLeft <= 7) alertLevel = 'critical';
      else if (daysLeft <= 14) alertLevel = 'warning';
      else if (daysLeft <= 30) alertLevel = 'attention';

      return {
        id: emp.id,
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.employeeCode,
        department: emp.department?.name || '-',
        contractDuration: emp.contractDuration,
        contractEnd: emp.contractEnd,
        daysLeft,
        alertLevel,
        renewalCount: 0, // Simplified as it's no longer tracked in Employee model directly
      };
    });

    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Position Allowance Matrix ───────────────────

const getPositionAllowances = async (req, res) => {
  try {
    const { position } = req.query;
    const where = {};
    if (position) where.position = position;

    const data = await prisma.positionAllowance.findMany({
      where,
      include: { salaryComponent: true },
      orderBy: [{ position: 'asc' }, { salaryComponent: { sortOrder: 'asc' } }],
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getPositionAllowanceMatrix = async (req, res) => {
  try {
    // Get all unique positions from employees
    const positions = await prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { position: true },
      distinct: ['position'],
    });
    const uniquePositions = positions.map(p => p.position).filter(Boolean).sort();

    // Get all active ALLOWANCE components
    const components = await prisma.salaryComponent.findMany({
      where: { type: 'ALLOWANCE', isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Get all existing position allowances
    const existing = await prisma.positionAllowance.findMany({
      include: { salaryComponent: true },
    });

    // Build matrix: { position -> { componentId -> nominal } }
    const matrix = {};
    for (const pos of uniquePositions) {
      matrix[pos] = {};
      for (const comp of components) {
        const found = existing.find(e => e.position === pos && e.salaryComponentId === comp.id);
        matrix[pos][comp.id] = found ? found.nominal : 0;
      }
    }

    res.json({ success: true, data: { positions: uniquePositions, components, matrix, existing } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const upsertPositionAllowance = async (req, res) => {
  try {
    const { position, salaryComponentId, nominal } = req.body;
    if (!position || !salaryComponentId) {
      return res.status(400).json({ success: false, message: 'Position and component are required' });
    }

    const data = await prisma.positionAllowance.upsert({
      where: {
        position_salaryComponentId: {
          position,
          salaryComponentId: parseInt(salaryComponentId),
        },
      },
      update: { nominal: parseFloat(nominal) || 0 },
      create: {
        position,
        salaryComponentId: parseInt(salaryComponentId),
        nominal: parseFloat(nominal) || 0,
      },
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const batchUpsertPositionAllowances = async (req, res) => {
  try {
    const { entries } = req.body; // [{ position, salaryComponentId, nominal }]
    if (!entries || !Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: 'Entries array is required' });
    }

    let count = 0;
    for (const entry of entries) {
      await prisma.positionAllowance.upsert({
        where: {
          position_salaryComponentId: {
            position: entry.position,
            salaryComponentId: parseInt(entry.salaryComponentId),
          },
        },
        update: { nominal: parseFloat(entry.nominal) || 0 },
        create: {
          position: entry.position,
          salaryComponentId: parseInt(entry.salaryComponentId),
          nominal: parseFloat(entry.nominal) || 0,
        },
      });
      count++;
    }

    res.json({ success: true, message: `Updated ${count} position allowances` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deletePositionAllowance = async (req, res) => {
  try {
    await prisma.positionAllowance.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Position allowance deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getConfig, updateConfig,
  getComponents, createComponent, updateComponent, deleteComponent,
  getOvertimeRules, createOvertimeRule, updateOvertimeRule, deleteOvertimeRule,
  getEmployeeSalaries, getEmployeeSalary, setEmployeeSalary, batchSetSalary,
  getPkwtAlerts,
  getPositionAllowances, getPositionAllowanceMatrix, upsertPositionAllowance, batchUpsertPositionAllowances, deletePositionAllowance,
};
