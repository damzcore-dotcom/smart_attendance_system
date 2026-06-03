/**
 * Bridge Routes — Internal API for AI Engine ↔ Smart Attendance communication.
 * These endpoints are protected by X-Bridge-Key header (not JWT).
 * Only the AI Face Recognition microservice should call these endpoints.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { deleteMinioObject } = require('../utils/minioHelper');

// ── Bridge Key Middleware ────────────────────────────────────────────────
const verifyBridgeKey = (req, res, next) => {
  const key = req.headers['x-bridge-key'];
  const BRIDGE_KEY = process.env.INTERNAL_BRIDGE_KEY;
  if (!BRIDGE_KEY) {
    return res.status(503).json({ success: false, message: 'Bridge authentication not configured. Set INTERNAL_BRIDGE_KEY env variable.' });
  }
  if (!key || key !== BRIDGE_KEY) {
    return res.status(401).json({ success: false, message: 'Invalid bridge key' });
  }
  next();
};

const verifyTokenOrBridgeKey = (req, res, next) => {
  const key = req.headers['x-bridge-key'];
  const BRIDGE_KEY = process.env.INTERNAL_BRIDGE_KEY;
  if (key && BRIDGE_KEY && key === BRIDGE_KEY) {
    return next();
  }
  verifyToken(req, res, next);
};

// We no longer apply this globally, because some routes are for the Admin panel.
// router.use(verifyBridgeKey);

// ── Health Check ────────────────────────────────────────────────────────
router.get('/health', verifyBridgeKey, (req, res) => {
  res.json({ success: true, status: 'ok', bridge: 'connected' });
});

// ── Get Employee + Active Shift ─────────────────────────────────────────
router.get('/employee/:id', verifyBridgeKey, async (req, res) => {
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

    // Determine active shift (override takes priority)
    const activeShift = employee.shiftOverrides.length > 0
      ? employee.shiftOverrides[0].shift
      : employee.shift;

    const gracePeriod = activeShift?.gracePeriod || 15;
    let checkinDeadline = '09:00';
    if (activeShift?.startTime) {
      // Calculate deadline = startTime + gracePeriod
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
    console.error('[Bridge] Get employee error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Record Check-In from CCTV ───────────────────────────────────────────
router.post('/checkin', verifyBridgeKey, async (req, res) => {
  try {
    const { employeeId, date, timestamp, cameraId, similarity, photoUrl, status, source } = req.body;

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Get Camera Schedule
    const camera = await prisma.camera.findUnique({
      where: { id: cameraId }
    });

    if (!camera) {
      return res.status(404).json({ success: false, message: 'Camera not found' });
    }

    // Get Employee and their Shift
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

    // Parsing helper
    const parseTime = (tString, defaultVal) => {
      if (!tString) return defaultVal;
      const [h, min] = tString.split(':').map(Number);
      return h * 60 + min;
    };

    const eventTime = new Date(timestamp);
    const m = eventTime.getHours() * 60 + eventTime.getMinutes(); // current minutes in day

    let isCheckInPeriod = false;
    let isCheckOutPeriod = false;
    let shiftStartMin = null;

    // 1. DYNAMIC SHIFT SCHEDULE (Flexible for any company rules)
    const activeShift = employee?.shiftOverrides?.length > 0 ? employee.shiftOverrides[0].shift : employee?.shift;
    
    if (activeShift) {
      shiftStartMin = parseTime(activeShift.startTime, 8 * 60);
      const shiftEndMin = parseTime(activeShift.endTime, 17 * 60);
      
      // Check-In Window: 2 hours before shift start, up to 4 hours after shift start
      const inWindowStart = shiftStartMin - (2 * 60);
      const inWindowEnd = shiftStartMin + (4 * 60);
      
      // Check-Out Window: 1 hour before shift end, up to 6 hours after shift end
      const outWindowStart = shiftEndMin - (1 * 60);
      const outWindowEnd = shiftEndMin + (6 * 60);

      isCheckInPeriod = m >= inWindowStart && m <= inWindowEnd;
      isCheckOutPeriod = m >= outWindowStart && m <= outWindowEnd;
    } else {
      // 2. FALLBACK TO CAMERA GLOBAL SCHEDULE (If employee has no shift)
      const inStart = parseTime(camera.captureInStart, 6 * 60); // 06:00
      const inEnd = parseTime(camera.captureInEnd, 10 * 60); // 10:00
      const outStart = parseTime(camera.captureOutStart, 15 * 60); // 15:00
      const outEnd = parseTime(camera.captureOutEnd, 21 * 60); // 21:00
      
      isCheckInPeriod = m >= inStart && m <= inEnd;
      isCheckOutPeriod = m >= outStart && m <= outEnd;
    }

    if (!isCheckInPeriod && !isCheckOutPeriod) {
      return res.json({ success: true, ignored: true, message: 'Outside scheduled capture times (Shift / Global)' });
    }

    // Hitung late minutes jika LATE
    let lateMinutes = 0;
    if (status === 'LATE' && isCheckInPeriod && shiftStartMin) {
      lateMinutes = Math.max(0, m - shiftStartMin);
    }

    // Upsert logic
    // Jika tidak ada di DB untuk hari ini
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: attendanceDate } }
    });

    let checkinData = existing ? existing.checkIn : null;
    let checkoutData = existing ? existing.checkOut : null;

    if (!existing && isCheckInPeriod) {
      // First check in
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
        }
      });
      return res.json({ success: true, data: attendance, type: 'CHECKIN' });
    }

    if (existing) {
      const updateData = {};
      let type = 'UPDATE';
      
      // Jika masih masa check-in period dan belum pernah check-in
      if (isCheckInPeriod && !existing.checkIn) {
        updateData.checkIn = eventTime;
        updateData.status = status === 'LATE' ? 'LATE' : 'PRESENT';
        updateData.lateMinutes = lateMinutes;
        updateData.checkinPhotoUrl = photoUrl;
        updateData.checkinSimilarity = similarity;
        updateData.checkinCameraId = cameraId;
        type = 'CHECKIN_RECOVERY';
      }
      
      // Jika masa check-out period
      if (isCheckOutPeriod) {
        updateData.checkOut = eventTime;
        updateData.checkoutPhotoUrl = photoUrl;
        updateData.checkoutSimilarity = similarity;
        updateData.checkoutCameraId = cameraId;
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
    console.error('[Bridge] Checkin error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Log Face Event (audit trail) ────────────────────────────────────────
router.post('/face-event', verifyBridgeKey, async (req, res) => {
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
    console.error('[Bridge] Face event error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Unknown Face Alert ──────────────────────────────────────────────────
router.post('/alert/unknown', verifyBridgeKey, async (req, res) => {
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
    console.error('[Bridge] Unknown alert error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Save Face Enrollment ────────────────────────────────────────────────
router.post('/enrollment/save', verifyBridgeKey, async (req, res) => {
  try {
    const { employeeId, embedding, samplesCount } = req.body;

    if (!embedding || !Array.isArray(embedding)) {
      return res.status(400).json({ success: false, message: 'Invalid embedding data' });
    }

    const updated = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        faceEmbeddingV2: embedding,
        faceEnrolledAt: new Date(),
        faceSamples: samplesCount || 1,
        faceStatus: 'ENROLLED',
      }
    });

    res.json({ success: true, data: { id: updated.id, faceStatus: updated.faceStatus } });
  } catch (err) {
    console.error('[Bridge] Save enrollment error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get All Embeddings (for Redis cache reload) ─────────────────────────
router.get('/embeddings', verifyBridgeKey, async (req, res) => {
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
    console.error('[Bridge] Get embeddings error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Broadcast Event (for WebSocket relay, placeholder) ──────────────────
router.post('/event/broadcast', verifyBridgeKey, async (req, res) => {
  // TODO: Integrate with WebSocket manager when available
  // For now, just log the event
  const event = req.body;
  console.log('[Bridge] Event broadcast:', event.type, event.payload?.name || '');
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════
// Camera Management Endpoints (for Admin Panel)
// ══════════════════════════════════════════════════════════════════════════

// Get all cameras (accessible by Admin JWT or AI Engine Bridge Key)
router.get('/cameras', verifyTokenOrBridgeKey, async (req, res) => {
  try {
    const cameras = await prisma.camera.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { faceEvents: true, unknownAlerts: true } }
      }
    });
    res.json({ success: true, data: cameras });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Test camera connection (via AI Engine proxy)
router.post('/cameras/test', verifyToken, requireAdmin, async (req, res) => {
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
        headers: {
          'Content-Type': 'application/json'
        },
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
    console.error('[Bridge] Camera connection test error:', err.message);
    res.status(500).json({ 
      success: false, 
      message: 'AI Engine tidak merespons atau tidak dapat dijangkau. Pastikan AI Engine berjalan.' 
    });
  }
});

// Get camera ROI configurations
router.get('/cameras/rois', verifyToken, requireAdmin, async (req, res) => {
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
    console.error('[Bridge] Get camera ROIs error:', err.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil konfigurasi ROI dari AI Engine.' });
  }
});

// Update camera ROI configuration
router.post('/cameras/rois', verifyToken, requireAdmin, async (req, res) => {
  try {
    const aiHost = process.env.AI_ENGINE_URL || 'http://127.0.0.1:8002';
    const response = await fetch(`${aiHost}/cameras/rois`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
    console.error('[Bridge] Post camera ROIs error:', err.message);
    res.status(500).json({ success: false, message: 'Gagal menyimpan konfigurasi ROI ke AI Engine.' });
  }
});

// Create camera
router.post('/cameras', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id, name, location, ipAddress, rtspUrl, direction, detectUnknown, captureInStart, captureInEnd, captureOutStart, captureOutEnd } = req.body;
    const camera = await prisma.camera.create({
      data: { id, name, location, ipAddress, rtspUrl, direction: direction || 'BOTH',
        detectUnknown: detectUnknown !== false,
        captureInStart: captureInStart || '06:00',
        captureInEnd: captureInEnd || '10:00',
        captureOutStart: captureOutStart || '15:00',
        captureOutEnd: captureOutEnd || '21:00'
      }
    });
    res.json({ success: true, data: camera });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update camera
router.put('/cameras/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, location, ipAddress, rtspUrl, direction, active, detectUnknown, captureInStart, captureInEnd, captureOutStart, captureOutEnd } = req.body;
    const camera = await prisma.camera.update({
      where: { id: req.params.id },
      data: { name, location, ipAddress, rtspUrl, direction, active,
        detectUnknown: detectUnknown !== false,
        captureInStart, captureInEnd, captureOutStart, captureOutEnd
      }
    });
    res.json({ success: true, data: camera });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete camera
router.delete('/cameras/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await prisma.camera.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get Unknown Face Alerts ─────────────────────────────────────────────
router.get('/alerts/unknown', verifyToken, async (req, res) => {
  try {
    const { resolved, limit = 50, startDate, endDate } = req.query;
    const where = {};
    if (resolved !== undefined) where.resolved = resolved === 'true';

    if (startDate || endDate) {
      where.eventTime = {};
      if (startDate) where.eventTime.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.eventTime.lte = end;
      }
    }

    const alerts = await prisma.unknownFaceAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: { camera: true }
    });

    // Convert MinIO object paths to accessible proxy URLs
    const mapped = alerts.map(a => ({
      ...a,
      photoUrl: a.photoUrl ? `/minio/${a.photoUrl}` : null
    }));

    res.json({ success: true, data: mapped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Resolve an unknown face alert
router.put('/alerts/unknown/:id/resolve', verifyToken, async (req, res) => {
  try {
    const { resolvedBy, notes } = req.body;
    const alert = await prisma.unknownFaceAlert.update({
      where: { id: parseInt(req.params.id) },
      data: { resolved: true, resolvedBy, resolvedAt: new Date(), notes }
    });
    res.json({ success: true, data: alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete a single unknown face alert
router.delete('/alerts/unknown/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const alert = await prisma.unknownFaceAlert.findUnique({
      where: { id }
    });

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    // Delete photo from MinIO if it exists
    if (alert.photoUrl) {
      await deleteMinioObject(alert.photoUrl);
    }

    // Delete record from Prisma database
    await prisma.unknownFaceAlert.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Alert deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Bulk delete unknown face alerts
router.delete('/alerts/unknown', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { resolvedOnly, startDate, endDate } = req.query;
    const where = {};
    if (resolvedOnly === 'true') {
      where.resolved = true;
    }

    if (startDate || endDate) {
      where.eventTime = {};
      if (startDate) where.eventTime.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.eventTime.lte = end;
      }
    }

    // Find all alerts matching criteria to delete their MinIO objects first
    const alerts = await prisma.unknownFaceAlert.findMany({
      where,
      select: { id: true, photoUrl: true }
    });

    // Delete photos from MinIO
    for (const alert of alerts) {
      if (alert.photoUrl) {
        await deleteMinioObject(alert.photoUrl);
      }
    }

    // Delete records from database
    const deleteResult = await prisma.unknownFaceAlert.deleteMany({
      where
    });

    res.json({ 
      success: true, 
      message: `Successfully deleted ${deleteResult.count} alerts`,
      count: deleteResult.count
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get Face Events (for monitoring dashboard) ──────────────────────────
router.get('/face-events', verifyToken, async (req, res) => {
  try {
    const { cameraId, limit = 100, startDate, endDate } = req.query;
    const where = {};
    if (cameraId) where.cameraId = cameraId;
    if (startDate || endDate) {
      where.eventTime = {};
      if (startDate) where.eventTime.gte = new Date(startDate);
      if (endDate) where.eventTime.lte = new Date(endDate);
    }

    const events = await prisma.faceEvent.findMany({
      where,
      orderBy: { eventTime: 'desc' },
      take: parseInt(limit),
      include: { camera: true }
    });

    // Ambil info nama & code karyawan secara paralel di memori
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
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
