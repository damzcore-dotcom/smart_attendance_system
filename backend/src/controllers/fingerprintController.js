/**
 * Fingerprint Management Controller
 * Handles device user management, fingerprint enrollment & push operations
 */

const prisma = require('../prismaClient');
const zkHelper = require('../utils/zkHelper');
const { recordAuditLog } = require('./auditLogController');

const { handleControllerError } = require('../middleware/validate');
// ============================================================
// GET DEVICE DETAIL (Users on device + info)
// ============================================================
const getDeviceDetail = async (req, res) => {
  const { id } = req.params;
  
  try {
    const device = await prisma.device.findUnique({ 
      where: { id: parseInt(id) },
      include: { 
        deviceUsers: { 
          include: { employee: { select: { id: true, name: true, employeeCode: true, department: { select: { name: true } } } } } 
        }
      }
    });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    let deviceInfo = null;
    let machineUsers = [];

    try {
      const zk = await zkHelper.createConnection(device.ipAddress, device.port);
      try {
        deviceInfo = await zkHelper.getDeviceInfo(zk);
        const usersResult = await zk.getUsers();
        machineUsers = usersResult?.data || [];
      } finally {
        await zkHelper.safeDisconnect(zk);
      }
    } catch (connErr) {
      console.log(`[FP] Cannot connect to device ${device.name}: ${connErr.message}`);
    }

    // Cross-reference machine users with DB employees
    const employees = await prisma.employee.findMany({
      select: { id: true, name: true, employeeCode: true, fingerPrintId: true, department: { select: { name: true } } }
    });

    const empByFP = {};
    const empByCode = {};
    employees.forEach(e => {
      if (e.fingerPrintId) empByFP[e.fingerPrintId.trim()] = e;
      if (e.employeeCode) empByCode[e.employeeCode.trim()] = e;
    });

    const enrichedUsers = machineUsers.map(mu => {
      const pinStr = String(mu.userId).trim();
      const emp = empByFP[pinStr] || empByCode[pinStr];
      return {
        uid: mu.uid,
        userId: mu.userId,
        name: mu.name,
        role: mu.role,
        cardno: mu.cardno,
        linked: !!emp,
        employee: emp ? { id: emp.id, name: emp.name, employeeCode: emp.employeeCode, department: emp.department?.name } : null
      };
    });

    res.json({ 
      success: true, 
      data: { 
        device, 
        deviceInfo, 
        machineUsers: enrichedUsers,
        dbUserCount: device.deviceUsers.length
      } 
    });
  } catch (err) {
    console.error('[FP] getDeviceDetail error:', err);
    handleControllerError(res, err, 'fingerprintController');
  }
};

// ============================================================
// PUSH USERS TO DEVICE (Write employee + fingerprints to device)
// ============================================================
const pushUsersToDevice = async (req, res) => {
  const { id } = req.params; // device id
  const { employeeIds } = req.body;
  
  if (!employeeIds || employeeIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Tidak ada karyawan yang dipilih' });
  }

  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds.map(Number) } },
      include: { fingerTemplates: true }
    });

    const zk = await zkHelper.createConnection(device.ipAddress, device.port);
    const results = [];

    try {
      // Get existing users to determine next available UID
      const existingUsers = await zk.getUsers();
      const existingUids = new Set((existingUsers?.data || []).map(u => u.uid));
      const existingPins = new Set((existingUsers?.data || []).map(u => String(u.userId).trim()));
      
      let nextUid = 1;
      while (existingUids.has(nextUid)) nextUid++;

      for (const emp of employees) {
        const pinStr = emp.fingerPrintId || emp.employeeCode;
        
        try {
          // Check if user already on device
          let uid;
          const existingMachineUser = (existingUsers?.data || []).find(
            u => String(u.userId).trim() === pinStr.trim()
          );
          
          if (existingMachineUser) {
            uid = existingMachineUser.uid;
          } else {
            uid = nextUid;
            nextUid++;
            while (existingUids.has(nextUid)) nextUid++;
          }
          
          // Step 1: Write user info to device
          await zkHelper.setUser(zk, uid, pinStr, emp.name, '', 0, 0);
          
          // Step 2: Write fingerprint templates (if any in our DB)
          let fpPushed = 0;
          for (const ft of emp.fingerTemplates) {
            try {
              await zkHelper.uploadFingerTemplate(zk, uid, ft.fingerId, ft.templateData, 1);
              fpPushed++;
            } catch (fpErr) {
              console.log(`[FP] Failed to push template finger ${ft.fingerId} for ${emp.name}: ${fpErr.message}`);
            }
          }
          
          // Step 3: Update DeviceUser record in DB
          await prisma.deviceUser.upsert({
            where: { deviceId_employeeId: { deviceId: device.id, employeeId: emp.id } },
            create: { deviceId: device.id, employeeId: emp.id, uid, acNo: pinStr, fpCount: fpPushed },
            update: { uid, acNo: pinStr, fpCount: fpPushed, syncedAt: new Date() }
          });

          results.push({ employeeId: emp.id, name: emp.name, success: true, uid, fpPushed });
        } catch (empErr) {
          results.push({ employeeId: emp.id, name: emp.name, success: false, error: empErr.message });
        }
      }
    } finally {
      await zkHelper.safeDisconnect(zk);
    }

    const successCount = results.filter(r => r.success).length;

    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'SYNC',
      entity: 'Device',
      entityId: device.id,
      details: JSON.stringify({
        message: `Pushed users to device ${device.name}`,
        totalRequested: employees.length,
        successCount,
        results: results.map(r => ({ name: r.name, success: r.success, fpPushed: r.fpPushed }))
      }),
      ipAddress: req.ip
    });

    res.json({ 
      success: true, 
      message: `${successCount}/${employees.length} karyawan berhasil di-push ke mesin ${device.name}`,
      data: results 
    });
  } catch (err) {
    console.error('[FP] pushUsersToDevice error:', err);
    handleControllerError(res, err, 'fingerprintController');
  }
};

// ============================================================
// PULL TEMPLATES FROM DEVICE (Read FP templates, save to DB)
// ============================================================
const pullTemplatesFromDevice = async (req, res) => {
  const { id } = req.params; // device id
  const { uids } = req.body; // optional filter: only specific uids

  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const zk = await zkHelper.createConnection(device.ipAddress, device.port);
    let templates = [];
    let machineUsers = [];

    try {
      const usersResult = await zk.getUsers();
      machineUsers = usersResult?.data || [];
      
      templates = await zkHelper.readAllTemplates(zk);
    } finally {
      await zkHelper.safeDisconnect(zk);
    }

    if (templates.length === 0) {
      return res.json({ success: true, message: 'Tidak ada template sidik jari di mesin', data: { saved: 0 } });
    }

    // Cross-reference UIDs with employees
    const employees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true, fingerPrintId: true }
    });

    const empByFP = {};
    const empByCode = {};
    employees.forEach(e => {
      if (e.fingerPrintId) empByFP[e.fingerPrintId.trim()] = e;
      if (e.employeeCode) empByCode[e.employeeCode.trim()] = e;
    });

    // Map machine UID -> userId (PIN)
    const uidToPin = {};
    machineUsers.forEach(mu => { uidToPin[mu.uid] = String(mu.userId).trim(); });

    let savedCount = 0;
    let skippedCount = 0;

    for (const tpl of templates) {
      if (uids && uids.length > 0 && !uids.includes(tpl.uid)) continue;

      const pin = uidToPin[tpl.uid];
      if (!pin) { skippedCount++; continue; }

      const emp = empByFP[pin] || empByCode[pin];
      if (!emp) { skippedCount++; continue; }

      try {
        await prisma.fingerTemplate.upsert({
          where: { employeeId_fingerId: { employeeId: emp.id, fingerId: tpl.fingerId } },
          create: {
            employeeId: emp.id,
            fingerId: tpl.fingerId,
            templateData: tpl.template,
            templateSize: tpl.size,
            enrolledFrom: device.id
          },
          update: {
            templateData: tpl.template,
            templateSize: tpl.size,
            enrolledFrom: device.id,
            enrolledAt: new Date()
          }
        });
        savedCount++;
      } catch (saveErr) {
        console.log(`[FP] Failed to save template for emp ${emp.id} finger ${tpl.fingerId}: ${saveErr.message}`);
      }
    }

    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'SYNC',
      entity: 'Device',
      entityId: device.id,
      details: JSON.stringify({
        message: `Pulled templates from device ${device.name}`,
        savedCount,
        skippedCount,
        totalOnDevice: templates.length
      }),
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `${savedCount} template berhasil ditarik, ${skippedCount} dilewati (unlinked)`,
      data: { saved: savedCount, skipped: skippedCount, totalOnDevice: templates.length }
    });
  } catch (err) {
    console.error('[FP] pullTemplatesFromDevice error:', err);
    handleControllerError(res, err, 'fingerprintController');
  }
};

// ============================================================
// DELETE USER FROM DEVICE
// ============================================================
const deleteUserFromDevice = async (req, res) => {
  const { id, uid } = req.params; // device id, machine uid
  
  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const zk = await zkHelper.createConnection(device.ipAddress, device.port);
    try {
      await zkHelper.deleteUser(zk, parseInt(uid));
    } finally {
      await zkHelper.safeDisconnect(zk);
    }

    // Remove DeviceUser record by uid
    await prisma.deviceUser.deleteMany({ 
      where: { deviceId: device.id, uid: parseInt(uid) } 
    });

    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'DELETE',
      entity: 'DeviceUser',
      entityId: device.id,
      details: JSON.stringify({
        message: `Deleted user uid ${uid} from device ${device.name}`,
        uid: parseInt(uid),
        device: device.name
      }),
      ipAddress: req.ip
    });

    res.json({ success: true, message: `User uid ${uid} berhasil dihapus dari mesin` });
  } catch (err) {
    console.error('[FP] deleteUserFromDevice error:', err);
    handleControllerError(res, err, 'fingerprintController');
  }
};

// ============================================================
// GET EMPLOYEE FINGERPRINT INFO (Templates stored in DB)
// ============================================================
const getEmployeeTemplates = async (req, res) => {
  const { empId } = req.params;
  
  try {
    const templates = await prisma.fingerTemplate.findMany({
      where: { employeeId: parseInt(empId) },
      select: { id: true, fingerId: true, templateSize: true, enrolledAt: true, enrolledFrom: true }
    });

    const deviceUsers = await prisma.deviceUser.findMany({
      where: { employeeId: parseInt(empId) },
      include: { device: { select: { id: true, name: true, ipAddress: true } } }
    });

    res.json({
      success: true,
      data: {
        fingerCount: templates.length,
        templates,
        enrolledDevices: deviceUsers
      }
    });
  } catch (err) {
    handleControllerError(res, err, 'fingerprintController');
  }
};

// ============================================================
// GET ALL EMPLOYEES WITH FP STATUS (For push page)
// ============================================================
const getEmployeesWithFPStatus = async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        AND: [
          {
            OR: [
              { employmentStatus: null },
              { employmentStatus: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          },
          {
            OR: [
              { salaryCategory: null },
              { salaryCategory: { notIn: ['HARIAN', 'Harian', 'BHL', 'DAILY', 'harian', 'bhl', 'daily'] } }
            ]
          }
        ]
      },
      select: {
        id: true, name: true, employeeCode: true, fingerPrintId: true,
        department: { select: { name: true } },
        shift: { select: { name: true } },
        _count: { select: { fingerTemplates: true, deviceUsers: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ success: true, data: employees });
  } catch (err) {
    handleControllerError(res, err, 'fingerprintController');
  }
};

// Helper for next employee code
async function getNextEmployeeCode() {
  const allEmployees = await prisma.employee.findMany({
    select: { employeeCode: true },
    orderBy: { id: 'desc' }
  });
  
  let maxCode = 0;
  for (const emp of allEmployees) {
    const code = emp.employeeCode || '';
    const numericPart = parseInt(code.replace(/\D/g, ''), 10);
    if (!isNaN(numericPart) && numericPart > maxCode) {
      maxCode = numericPart;
    }
  }
  
  return String(maxCode + 1);
}

// ============================================================
// LINK USER TO EMPLOYEE
// ============================================================
const linkUserToEmployee = async (req, res) => {
  const { id, uid } = req.params; // device id, machine uid
  const { employeeId } = req.body;

  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const employee = await prisma.employee.findUnique({ where: { id: parseInt(employeeId) } });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const zk = await zkHelper.createConnection(device.ipAddress, device.port);
    let machineUsers = [];
    try {
      const usersResult = await zk.getUsers();
      machineUsers = usersResult?.data || [];
    } finally {
      await zkHelper.safeDisconnect(zk);
    }

    const mUser = machineUsers.find(mu => mu.uid === parseInt(uid));
    if (!mUser) {
      return res.status(400).json({ success: false, message: 'User tidak ditemukan di mesin' });
    }

    const pinStr = String(mUser.userId).trim();

    // Check if another employee is already linked to this PIN
    const otherEmp = await prisma.employee.findFirst({
      where: {
        id: { not: employee.id },
        fingerPrintId: pinStr
      }
    });
    if (otherEmp) {
      return res.status(400).json({ success: false, message: `PIN/AC No. ${pinStr} sudah dihubungkan dengan karyawan lain (${otherEmp.name})` });
    }

    // Step 1: Update Employee's fingerPrintId
    await prisma.employee.update({
      where: { id: employee.id },
      data: { fingerPrintId: pinStr }
    });

    // Step 2: Connect to device again to pull templates for this specific user
    let pulledFpCount = 0;
    const zkConn = await zkHelper.createConnection(device.ipAddress, device.port);
    try {
      const templates = await zkHelper.getAllUserTemplates(zkConn, mUser.uid);
      for (const tpl of templates) {
        await prisma.fingerTemplate.upsert({
          where: { employeeId_fingerId: { employeeId: employee.id, fingerId: tpl.fingerId } },
          create: {
            employeeId: employee.id,
            fingerId: tpl.fingerId,
            templateData: tpl.template,
            templateSize: tpl.template.length,
            enrolledFrom: device.id
          },
          update: {
            templateData: tpl.template,
            templateSize: tpl.template.length,
            enrolledFrom: device.id,
            enrolledAt: new Date()
          }
        });
        pulledFpCount++;
      }
    } catch (tplErr) {
      console.warn(`[FP Link] Could not pull templates for uid ${uid}: ${tplErr.message}`);
    } finally {
      await zkHelper.safeDisconnect(zkConn);
    }

    // Step 3: Upsert DeviceUser record
    await prisma.deviceUser.upsert({
      where: { deviceId_employeeId: { deviceId: device.id, employeeId: employee.id } },
      create: { deviceId: device.id, employeeId: employee.id, uid: mUser.uid, acNo: pinStr, fpCount: pulledFpCount },
      update: { uid: mUser.uid, acNo: pinStr, fpCount: pulledFpCount, syncedAt: new Date() }
    });

    // Step 4: Audit Log
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'UPDATE',
      entity: 'DeviceUser',
      entityId: device.id,
      details: JSON.stringify({
        message: `Linked machine user uid ${uid} to employee ${employee.name}`,
        employeeId: employee.id,
        employeeName: employee.name,
        pin: pinStr,
        device: device.name,
        templatesPulled: pulledFpCount
      }),
      ipAddress: req.ip
    });

    res.json({ 
      success: true, 
      message: `Karyawan ${employee.name} berhasil dihubungkan ke PIN ${pinStr}. ${pulledFpCount} template sidik jari ditarik.` 
    });
  } catch (err) {
    console.error('[FP] linkUserToEmployee error:', err);
    handleControllerError(res, err, 'fingerprintController');
  }
};

// ============================================================
// START REMOTE ENROLLMENT
// ============================================================
const startDeviceEnrollment = async (req, res) => {
  const { id } = req.params; // device id
  const { employeeId, fingerId } = req.body;

  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const employee = await prisma.employee.findUnique({ where: { id: parseInt(employeeId) } });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    // Step 1: Check if employee has DeviceUser for this device
    let deviceUser = await prisma.deviceUser.findUnique({
      where: { deviceId_employeeId: { deviceId: device.id, employeeId: employee.id } }
    });

    let uid, pinStr;
    const zk = await zkHelper.createConnection(device.ipAddress, device.port);

    try {
      if (deviceUser) {
        uid = deviceUser.uid;
        pinStr = deviceUser.acNo;
      } else {
        // Find if user already exists on device under fingerPrintId or employeeCode
        const existingUsers = await zk.getUsers();
        pinStr = (employee.fingerPrintId || employee.employeeCode || '').trim();
        if (!pinStr) {
          pinStr = await getNextEmployeeCode();
          // Update employee with new fingerprint pin
          await prisma.employee.update({
            where: { id: employee.id },
            data: { fingerPrintId: pinStr }
          });
        }

        const existingMachineUser = (existingUsers?.data || []).find(
          u => String(u.userId).trim() === pinStr
        );

        if (existingMachineUser) {
          uid = existingMachineUser.uid;
        } else {
          // Find next available UID
          const existingUids = new Set((existingUsers?.data || []).map(u => u.uid));
          let nextUid = 1;
          while (existingUids.has(nextUid)) nextUid++;
          uid = nextUid;

          // Register user on device
          await zkHelper.setUser(zk, uid, pinStr, employee.name, '', 0, 0);
        }

        // Create DeviceUser in DB
        deviceUser = await prisma.deviceUser.upsert({
          where: { deviceId_employeeId: { deviceId: device.id, employeeId: employee.id } },
          create: { deviceId: device.id, employeeId: employee.id, uid, acNo: pinStr, fpCount: 0 },
          update: { uid, acNo: pinStr, syncedAt: new Date() }
        });
      }

      // Step 2: Trigger enrollment mode on machine
      await zkHelper.startEnroll(zk, uid, parseInt(fingerId));
    } finally {
      await zkHelper.safeDisconnect(zk);
    }

    res.json({
      success: true,
      message: `Mesin ${device.name} siap! Silakan tempelkan sidik jari karyawan di sensor sebanyak 3 kali.`,
      data: { uid, acNo: pinStr }
    });
  } catch (err) {
    handleControllerError(res, err, 'fingerprintController.startDeviceEnrollment');
  }
};

// ============================================================
// VERIFY AND SAVE ENROLLMENT
// ============================================================
const verifyAndSaveEnrollment = async (req, res) => {
  const { id } = req.params;
  const { employeeId, fingerId } = req.body;

  try {
    const device = await prisma.device.findUnique({ where: { id: parseInt(id) } });
    if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

    const employee = await prisma.employee.findUnique({ where: { id: parseInt(employeeId) } });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const deviceUser = await prisma.deviceUser.findUnique({
      where: { deviceId_employeeId: { deviceId: device.id, employeeId: employee.id } }
    });

    if (!deviceUser) {
      return res.status(400).json({ success: false, message: 'User belum terdaftar di mesin ini. Silakan mulai registrasi dahulu.' });
    }

    const zk = await zkHelper.createConnection(device.ipAddress, device.port);
    let template = null;
    try {
      template = await zkHelper.getFingerTemplate(zk, deviceUser.uid, parseInt(fingerId));
    } finally {
      await zkHelper.safeDisconnect(zk);
    }

    if (!template || template.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Template sidik jari tidak ditemukan di mesin. Karyawan mungkin belum menyelesaikan penempelan jari sebanyak 3 kali. Silakan coba lagi.' 
      });
    }

    // Save to FingerTemplate
    await prisma.fingerTemplate.upsert({
      where: { employeeId_fingerId: { employeeId: employee.id, fingerId: parseInt(fingerId) } },
      create: {
        employeeId: employee.id,
        fingerId: parseInt(fingerId),
        templateData: template,
        templateSize: template.length,
        enrolledFrom: device.id
      },
      update: {
        templateData: template,
        templateSize: template.length,
        enrolledFrom: device.id,
        enrolledAt: new Date()
      }
    });

    // Update DeviceUser fpCount
    const templatesCount = await prisma.fingerTemplate.count({
      where: { employeeId: employee.id }
    });

    await prisma.deviceUser.update({
      where: { id: deviceUser.id },
      data: { fpCount: templatesCount }
    });

    // Audit Log
    await recordAuditLog({
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'SYNC',
      entity: 'FingerTemplate',
      entityId: employee.id,
      details: JSON.stringify({
        message: `Fingerprint enrolled successfully via web wizard`,
        employeeName: employee.name,
        fingerId: parseInt(fingerId),
        device: device.name
      }),
      ipAddress: req.ip
    });

    res.json({
      success: true,
      message: `Sidik jari karyawan ${employee.name} berhasil diverifikasi dan disimpan ke database.`
    });
  } catch (err) {
    handleControllerError(res, err, 'fingerprintController.verifyAndSaveEnrollment');
  }
};

module.exports = {
  getDeviceDetail,
  pushUsersToDevice,
  pullTemplatesFromDevice,
  deleteUserFromDevice,
  getEmployeeTemplates,
  getEmployeesWithFPStatus,
  linkUserToEmployee,
  startDeviceEnrollment,
  verifyAndSaveEnrollment
};
