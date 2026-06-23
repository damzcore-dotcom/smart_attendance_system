const prisma = require('../prismaClient');
const { deleteMinioObject } = require('../utils/minioHelper');
const { recordAuditLog } = require('./auditLogController');
const { handleControllerError } = require('../middleware/validate');
const crypto = require('crypto');

// (removed dead code: attendanceSyncCache was declared but never used)

// GET /api/v1/bridge/health
const getHealth = (req, res) => {
  res.json({ success: true, status: 'ok', bridge: 'connected' });
};

// GET /api/v1/bridge/employee/:id
const getEmployee = async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        department: true,
        shift: true,
        shiftOverrides: {
          where: {
            startDate: { lte: new Date() },
            endDate: { gte: new Date() }
          },
          include: { shift: true },
          take: 1
        }
      }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const activeShift = employee.shiftOverrides.length > 0
      ? employee.shiftOverrides[0].shift
      : employee.shift;

    const gracePeriod = activeShift?.gracePeriod || 15;
    let checkinDeadline = '09:00';
    if (activeShift?.startTime) {
      const [h, m] = activeShift.startTime.split(':').map(Number);
      const totalMin = h * 60 + m + gracePeriod;
      checkinDeadline = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
    }

    res.json({
      success: true,
      data: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        department: employee.department,
        position: employee.position,
        activeShift: activeShift ? {
          name: activeShift.name,
          startTime: activeShift.startTime,
          endTime: activeShift.endTime,
          checkinDeadline,
          gracePeriod
        } : null
      }
    });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.getEmployee');
  }
};

// POST /api/v1/bridge/checkin
const postCheckin = async (req, res) => {
  try {
    const { employeeId, date, timestamp, cameraId, similarity, photoUrl, status, source, notes } = req.body;

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const camera = await prisma.camera.findUnique({
      where: { id: cameraId }
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        shift: true,
        shiftOverrides: {
          where: { startDate: { lte: attendanceDate }, endDate: { gte: attendanceDate } },
          include: { shift: true },
          take: 1
        }
      }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Karyawan tidak ditemukan' });
    }

    const parseTime = (tString, defaultVal) => {
      if (!tString) return defaultVal;
      const [h, min] = tString.split(':').map(Number);
      return h * 60 + min;
    };

    const eventTime = new Date(timestamp);
    const m = eventTime.getHours() * 60 + eventTime.getMinutes();

    let isCheckInPeriod = false;
    let isCheckOutPeriod = false;
    let shiftStartMin = null;

    // Load default shift from DB Settings (M-15)
    const settingsList = await prisma.settings.findMany();
    const defaultShiftStart = settingsList.find(s => s.key === 'defaultShiftStart')?.value || '08:00';
    const defaultShiftEnd = settingsList.find(s => s.key === 'defaultShiftEnd')?.value || '17:00';
    const defStartMin = parseTime(defaultShiftStart, 8 * 60);
    const defEndMin = parseTime(defaultShiftEnd, 17 * 60);

    const activeShift = employee?.shiftOverrides?.length > 0 ? employee.shiftOverrides[0].shift : employee?.shift;
    
    if (activeShift) {
      shiftStartMin = parseTime(activeShift.startTime, defStartMin);
      const shiftEndMin = parseTime(activeShift.endTime, defEndMin);
      
      const inWindowStart = shiftStartMin - (2 * 60);
      const inWindowEnd = shiftStartMin + (4 * 60);
      
      const outWindowStart = shiftEndMin - (1 * 60);
      const outWindowEnd = shiftEndMin + (6 * 60);

      isCheckInPeriod = m >= inWindowStart && m <= inWindowEnd;
      isCheckOutPeriod = m >= outWindowStart && m <= outWindowEnd;
    } else {
      const inStart = parseTime(camera.captureInStart, 6 * 60);
      const inEnd = parseTime(camera.captureInEnd, 10 * 60);
      const outStart = parseTime(camera.captureOutStart, 15 * 60);
      const outEnd = parseTime(camera.captureOutEnd, 21 * 60);
      
      isCheckInPeriod = m >= inStart && m <= inEnd;
      isCheckOutPeriod = m >= outStart && m <= outEnd;
    }

    if (!isCheckInPeriod && !isCheckOutPeriod) {
      return res.json({ success: true, ignored: true, message: 'Outside scheduled capture times (Shift / Global)' });
    }

    // Fetch grace period from active shift, default 15 min
    const gracePeriodMin = activeShift?.gracePeriod ?? 15;
    let lateMinutes = 0;
    if (status === 'LATE' && isCheckInPeriod && shiftStartMin) {
      lateMinutes = Math.max(0, m - shiftStartMin - gracePeriodMin);
    }

    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: attendanceDate } }
    });

    const isCameraIn = camera.direction === 'IN' || camera.direction === 'BOTH';
    const isCameraOut = camera.direction === 'OUT' || camera.direction === 'BOTH';

    if (!existing) {
      if (isCheckInPeriod && isCameraIn) {
        const attendance = await prisma.attendance.create({
          data: {
            employeeId,
            date: attendanceDate,
            checkIn: eventTime,
            status: status === 'LATE' ? 'LATE' : 'PRESENT',
            lateMinutes,
            mode: 'Face CCTV',
            source: source || 'face_cctv',
            checkinPhotoUrl: photoUrl,
            checkinSimilarity: similarity,
            checkinCameraId: cameraId,
            notes: notes || null
          }
        });
        return res.json({ success: true, data: attendance, type: 'CHECKIN' });
      } else {
        return res.json({ success: true, ignored: true, message: 'Outside check-in period or camera does not support IN direction' });
      }
    }

    if (existing) {
      const updateData = {};
      let type = 'UPDATE';
      
      if (!existing.checkIn && isCheckInPeriod && isCameraIn) {
        updateData.checkIn = eventTime;
        updateData.status = status === 'LATE' ? 'LATE' : 'PRESENT';
        updateData.lateMinutes = lateMinutes;
        updateData.checkinPhotoUrl = photoUrl;
        updateData.checkinSimilarity = similarity;
        updateData.checkinCameraId = cameraId;
        updateData.notes = notes || existing.notes;
        type = 'CHECKIN_RECOVERY';
      }
      
      if (existing.checkIn && isCheckOutPeriod && isCameraOut) {
        updateData.checkOut = eventTime;
        updateData.checkoutPhotoUrl = photoUrl;
        updateData.checkoutSimilarity = similarity;
        updateData.checkoutCameraId = cameraId;
        updateData.notes = notes ? (existing.notes ? `${existing.notes} | ${notes}` : notes) : existing.notes;
        type = 'CHECKOUT';
      }

      if (Object.keys(updateData).length > 0) {
        const attendance = await prisma.attendance.update({
          where: { id: existing.id },
          data: updateData
        });
        return res.json({ success: true, data: attendance, type });
      }
    }

    res.json({ success: true, ignored: true, message: 'Time mismatch or already handled' });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postCheckin');
  }
};

// POST /api/v1/bridge/face-event
const postFaceEvent = async (req, res) => {
  try {
    const { cameraId, employeeId, eventTime, similarity, livenessScore, isUnknown, isSpoof, photoUrl, processed } = req.body;

    const event = await prisma.faceEvent.create({
      data: {
        cameraId,
        employeeId: employeeId || null,
        eventTime: new Date(eventTime),
        similarity: similarity || null,
        livenessScore: livenessScore || null,
        isUnknown: isUnknown || false,
        isSpoof: isSpoof || false,
        photoUrl: photoUrl || null,
        processed: processed || false,
      }
    });

    res.json({ success: true, data: event });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postFaceEvent');
  }
};

// POST /api/v1/bridge/alert/unknown
const postUnknownAlert = async (req, res) => {
  try {
    const { cameraId, eventTime, photoUrl } = req.body;

    const alert = await prisma.unknownFaceAlert.create({
      data: {
        cameraId,
        eventTime: new Date(eventTime),
        photoUrl: photoUrl || null,
      }
    });

    res.json({ success: true, data: alert });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postUnknownAlert');
  }
};

// POST /api/v1/bridge/enrollment/save
const postEnrollmentSave = async (req, res) => {
  try {
    const { employeeId, embedding, slot, samplesCount } = req.body;

    if (!embedding || !Array.isArray(embedding)) {
      return res.status(400).json({ success: false, message: 'Invalid embedding data' });
    }

    const empId = parseInt(employeeId);
    
    const employee = await prisma.employee.findUnique({
      where: { id: empId },
      select: { faceEmbeddingV2: true }
    });

    let newEmbeddingsList = [];
    
    if (slot !== undefined) {
      const slotIdx = parseInt(slot) - 1;
      if (slotIdx < 0 || slotIdx >= 5) {
        return res.status(400).json({ success: false, message: 'Slot must be between 1 and 5' });
      }

      let existingList = [];
      if (employee && employee.faceEmbeddingV2) {
        try {
          const parsed = typeof employee.faceEmbeddingV2 === 'string'
            ? JSON.parse(employee.faceEmbeddingV2)
            : employee.faceEmbeddingV2;
          
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (Array.isArray(parsed[0])) {
              existingList = parsed;
            } else {
              existingList = [parsed];
            }
          }
        } catch (e) {
          console.error('Failed to parse existing embeddings:', e);
        }
      }

      while (existingList.length < 5) {
        existingList.push(null);
      }

      existingList[slotIdx] = embedding;
      newEmbeddingsList = existingList;
    } else {
      if (Array.isArray(embedding[0])) {
        newEmbeddingsList = embedding;
      } else {
        newEmbeddingsList = [embedding];
      }
    }

    const actualSamples = newEmbeddingsList.filter(Boolean).length;

    const updated = await prisma.employee.update({
      where: { id: empId },
      data: {
        faceEmbeddingV2: newEmbeddingsList,
        faceEnrolledAt: new Date(),
        faceSamples: samplesCount || actualSamples,
        faceStatus: 'ENROLLED',
      }
    });

    const { reloadFaceCache } = require('../utils/aiEngine');
    reloadFaceCache();

    res.json({ 
      success: true, 
      data: { 
        id: updated.id, 
        faceStatus: updated.faceStatus,
        faceSamples: updated.faceSamples 
      } 
    });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postEnrollmentSave');
  }
};

// GET /api/v1/bridge/embeddings
const getEmbeddings = async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: {
        faceEmbeddingV2: { not: null },
        status: 'ACTIVE'
      },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        faceEmbeddingV2: true,
      }
    });

    res.json({ success: true, data: employees });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.getEmbeddings');
  }
};

// POST /api/v1/bridge/event/broadcast
const postEventBroadcast = async (req, res) => {
  try {
    const event = req.body;
    console.log('[Bridge] Event broadcast:', event.type, event.payload?.name || '');
    res.json({ success: true });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postEventBroadcast');
  }
};

// GET /api/v1/bridge/cameras
const getCameras = async (req, res) => {
  try {
    const cameras = await prisma.camera.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { faceEvents: true, unknownAlerts: true } }
      }
    });
    res.json({ success: true, data: cameras });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.getCameras');
  }
};

// POST /api/v1/bridge/cameras/test
const postCamerasTest = async (req, res) => {
  try {
    const { rtspUrl } = req.body;
    if (!rtspUrl) {
      return res.status(400).json({ success: false, message: 'URL RTSP diperlukan untuk pengujian.' });
    }

    const aiHost = process.env.AI_ENGINE_URL || 'http://127.0.0.1:8002';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${aiHost}/cameras/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtspUrl }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          success: false,
          message: `AI Engine error (${response.status}): ${errorText || response.statusText}`
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      throw fetchErr;
    }
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postCamerasTest');
  }
};

// GET /api/v1/bridge/cameras/rois
const getCamerasRois = async (req, res) => {
  try {
    const aiHost = process.env.AI_ENGINE_URL || 'http://127.0.0.1:8002';
    const response = await fetch(`${aiHost}/cameras/rois`);
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: `AI Engine error: ${errorText || response.statusText}`
      });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.getCamerasRois');
  }
};

// POST /api/v1/bridge/cameras/rois
const postCamerasRois = async (req, res) => {
  try {
    const aiHost = process.env.AI_ENGINE_URL || 'http://127.0.0.1:8002';
    const response = await fetch(`${aiHost}/cameras/rois`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: `AI Engine error: ${errorText || response.statusText}`
      });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postCamerasRois');
  }
};

// POST /api/v1/bridge/cameras
const postCameras = async (req, res) => {
  try {
    const { id, name, location, ipAddress, rtspUrl, direction, detectUnknown, captureInStart, captureInEnd, captureOutStart, captureOutEnd } = req.body;
    const camera = await prisma.camera.create({
      data: { 
        id, name, location, ipAddress, rtspUrl, direction: direction || 'BOTH',
        detectUnknown: detectUnknown !== false,
        captureInStart: captureInStart || '06:00',
        captureInEnd: captureInEnd || '10:00',
        captureOutStart: captureOutStart || '15:00',
        captureOutEnd: captureOutEnd || '21:00'
      }
    });
    res.json({ success: true, data: camera });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.postCameras');
  }
};

// PUT /api/v1/bridge/cameras/:id
const putCamera = async (req, res) => {
  try {
    const { name, location, ipAddress, rtspUrl, direction, active, detectUnknown, captureInStart, captureInEnd, captureOutStart, captureOutEnd } = req.body;
    const camera = await prisma.camera.update({
      where: { id: req.params.id },
      data: { 
        name, location, ipAddress, rtspUrl, direction, active,
        detectUnknown: detectUnknown !== false,
        captureInStart, captureInEnd, captureOutStart, captureOutEnd
      }
    });
    res.json({ success: true, data: camera });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.putCamera');
  }
};

// DELETE /api/v1/bridge/cameras/:id
const deleteCamera = async (req, res) => {
  try {
    await prisma.camera.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.deleteCamera');
  }
};

// GET /api/v1/bridge/alerts/unknown
const getUnknownAlerts = async (req, res) => {
  try {
    const { resolved, limit = 50, startDate, endDate } = req.query;
    const where = {};
    if (resolved !== undefined) where.resolved = resolved === 'true';

    if (startDate || endDate) {
      const gteDate = startDate ? new Date(startDate) : null;
      const lteDate = endDate ? new Date(endDate) : null;
      const timeCond = {};
      if (gteDate && !isNaN(gteDate.getTime())) {
        timeCond.gte = gteDate;
      }
      if (lteDate && !isNaN(lteDate.getTime())) {
        lteDate.setHours(23, 59, 59, 999);
        timeCond.lte = lteDate;
      }
      if (Object.keys(timeCond).length > 0) {
        where.eventTime = timeCond;
      }
    }

    const alerts = await prisma.unknownFaceAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: { camera: true }
    });

    const mapped = alerts.map(a => ({
      ...a,
      photoUrl: a.photoUrl ? `/minio/${a.photoUrl}` : null
    }));

    res.json({ success: true, data: mapped });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.getUnknownAlerts');
  }
};

// PUT /api/v1/bridge/alerts/unknown/:id/resolve
const putUnknownAlertResolve = async (req, res) => {
  try {
    const { resolvedBy, notes } = req.body;
    const alert = await prisma.unknownFaceAlert.update({
      where: { id: parseInt(req.params.id) },
      data: { resolved: true, resolvedBy, resolvedAt: new Date(), notes }
    });
    res.json({ success: true, data: alert });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.putUnknownAlertResolve');
  }
};

// DELETE /api/v1/bridge/alerts/unknown/:id
const deleteUnknownAlert = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const alert = await prisma.unknownFaceAlert.findUnique({
      where: { id }
    });

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    if (alert.photoUrl) {
      await deleteMinioObject(alert.photoUrl);
    }

    await prisma.unknownFaceAlert.delete({ where: { id } });
    res.json({ success: true, message: 'Alert deleted successfully' });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.deleteUnknownAlert');
  }
};

// DELETE /api/v1/bridge/alerts/unknown (bulk)
const deleteUnknownAlertsBulk = async (req, res) => {
  try {
    const { resolvedOnly, startDate, endDate } = req.query;
    const where = {};
    if (resolvedOnly === 'true') {
      where.resolved = true;
    }

    if (startDate || endDate) {
      const gteDate = startDate ? new Date(startDate) : null;
      const lteDate = endDate ? new Date(endDate) : null;
      const timeCond = {};
      if (gteDate && !isNaN(gteDate.getTime())) {
        timeCond.gte = gteDate;
      }
      if (lteDate && !isNaN(lteDate.getTime())) {
        lteDate.setHours(23, 59, 59, 999);
        timeCond.lte = lteDate;
      }
      if (Object.keys(timeCond).length > 0) {
        where.eventTime = timeCond;
      }
    }

    const alerts = await prisma.unknownFaceAlert.findMany({
      where,
      select: { id: true, photoUrl: true }
    });

    for (const alert of alerts) {
      if (alert.photoUrl) {
        await deleteMinioObject(alert.photoUrl);
      }
    }

    const deleteResult = await prisma.unknownFaceAlert.deleteMany({ where });

    res.json({ 
      success: true, 
      message: `Successfully deleted ${deleteResult.count} alerts`,
      count: deleteResult.count
    });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.deleteUnknownAlertsBulk');
  }
};

// GET /api/v1/bridge/re-enrollment-suggestions
const getReenrollmentSuggestions = async (req, res) => {
  try {
    const aiHost = process.env.AI_ENGINE_URL || 'http://127.0.0.1:8002';
    const response = await fetch(`${aiHost}/re-enrollment-suggestions`);
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        success: false, 
        message: 'AI Engine returned an error' 
      });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({ 
      success: true, 
      count: 0, 
      threshold: 0.65, 
      suggestions: [],
      offline: true 
    });
  }
};

// GET /api/v1/bridge/face-events
const getFaceEvents = async (req, res) => {
  try {
    const { cameraId, limit = 100, startDate, endDate } = req.query;
    const where = {};
    if (cameraId) where.cameraId = cameraId;
    if (startDate || endDate) {
      const gteDate = startDate ? new Date(startDate) : null;
      const lteDate = endDate ? new Date(endDate) : null;
      const timeCond = {};
      if (gteDate && !isNaN(gteDate.getTime())) {
        timeCond.gte = gteDate;
      }
      if (lteDate && !isNaN(lteDate.getTime())) {
        timeCond.lte = lteDate;
      }
      if (Object.keys(timeCond).length > 0) {
        where.eventTime = timeCond;
      }
    }

    const events = await prisma.faceEvent.findMany({
      where,
      orderBy: { eventTime: 'desc' },
      take: parseInt(limit),
      include: { camera: true }
    });

    const employeeIds = [...new Set(events.map(e => e.employeeId).filter(Boolean))];
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, name: true, employeeCode: true }
    });
    const empMap = new Map(employees.map(e => [e.id, e]));

    const mappedEvents = events.map(e => ({
      ...e,
      photoUrl: e.photoUrl ? (e.photoUrl.startsWith('/') || e.photoUrl.startsWith('http') || e.photoUrl.startsWith('data:') ? e.photoUrl : `/minio/${e.photoUrl}`) : null,
      employeeName: e.employeeId ? (empMap.get(e.employeeId)?.name || 'Karyawan Aktif') : null,
      employeeCode: e.employeeId ? (empMap.get(e.employeeId)?.employeeCode || '') : null
    }));

    res.json({ success: true, data: mappedEvents });
  } catch (err) {
    handleControllerError(res, err, 'bridgeController.getFaceEvents');
  }
};

module.exports = {
  getHealth,
  getEmployee,
  postCheckin,
  postFaceEvent,
  postUnknownAlert,
  postEnrollmentSave,
  getEmbeddings,
  postEventBroadcast,
  getCameras,
  postCamerasTest,
  getCamerasRois,
  postCamerasRois,
  postCameras,
  putCamera,
  deleteCamera,
  getUnknownAlerts,
  putUnknownAlertResolve,
  deleteUnknownAlert,
  deleteUnknownAlertsBulk,
  getReenrollmentSuggestions,
  getFaceEvents
};
