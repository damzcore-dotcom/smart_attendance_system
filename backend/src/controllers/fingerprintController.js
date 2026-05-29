/**
 * Fingerprint Management Controller
 * Handles device user management, fingerprint enrollment & push operations
 */

const prisma = require('../prismaClient');
const zkHelper = require('../utils/zkHelper');
const { recordAuditLog } = require('./auditLogController');

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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getDeviceDetail,
  pushUsersToDevice,
  pullTemplatesFromDevice,
  deleteUserFromDevice,
  getEmployeeTemplates,
  getEmployeesWithFPStatus
};
