/**
 * Bridge Routes — Internal API for AI Engine ↔ Smart Attendance communication.
 * These endpoints are protected by X-Bridge-Key header (not JWT).
 * Only the AI Face Recognition microservice should call these endpoints.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

// ── Bridge Key Middleware ────────────────────────────────────────────────
const verifyBridgeKey = (req, res, next) => {
  const key = req.headers['x-bridge-key'];
  if (!key || key !== process.env.INTERNAL_BRIDGE_KEY) {
    return res.status(403).json({ success: false, message: 'Unauthorized bridge access' });
  }
  next();
};

// Apply to all bridge routes
router.use(verifyBridgeKey);

// ── Health Check ────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', bridge: 'connected' });
});

// ── Get Employee + Active Shift ─────────────────────────────────────────
router.get('/employee/:id', async (req, res) => {
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
router.post('/checkin', async (req, res) => {
  try {
    const { employeeId, date, timestamp, cameraId, similarity, photoUrl, status, source } = req.body;

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Calculate late minutes if LATE
    let lateMinutes = 0;
    if (status === 'LATE') {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { shift: true }
      });
      if (employee?.shift?.startTime) {
        const [sh, sm] = employee.shift.startTime.split(':').map(Number);
        const shiftStart = sh * 60 + sm;
        const checkTime = new Date(timestamp);
        const actualMin = checkTime.getHours() * 60 + checkTime.getMinutes();
        lateMinutes = Math.max(0, actualMin - shiftStart);
      }
    }

    // Upsert: create or update attendance for the day
    const attendance = await prisma.attendance.upsert({
      where: {
        employeeId_date: { employeeId, date: attendanceDate }
      },
      create: {
        employeeId,
        date: attendanceDate,
        checkIn: new Date(timestamp),
        status: status === 'LATE' ? 'LATE' : 'PRESENT',
        lateMinutes,
        mode: 'Face CCTV',
        source: source || 'face_cctv',
        checkinPhotoUrl: photoUrl,
        checkinSimilarity: similarity,
        checkinCameraId: cameraId,
      },
      update: {
        // If record exists, this is a check-out
        checkOut: new Date(timestamp),
        checkoutPhotoUrl: photoUrl,
        checkoutSimilarity: similarity,
        checkoutCameraId: cameraId,
      }
    });

    res.json({ success: true, data: attendance });
  } catch (err) {
    console.error('[Bridge] Checkin error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Log Face Event (audit trail) ────────────────────────────────────────
router.post('/face-event', async (req, res) => {
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
router.post('/alert/unknown', async (req, res) => {
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
router.post('/enrollment/save', async (req, res) => {
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
router.get('/embeddings', async (req, res) => {
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
router.post('/event/broadcast', async (req, res) => {
  // TODO: Integrate with WebSocket manager when available
  // For now, just log the event
  const event = req.body;
  console.log('[Bridge] Event broadcast:', event.type, event.payload?.name || '');
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════
// Camera Management Endpoints (for Admin Panel)
// ══════════════════════════════════════════════════════════════════════════

// Get all cameras
router.get('/cameras', async (req, res) => {
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

// Create camera
router.post('/cameras', async (req, res) => {
  try {
    const { id, name, location, ipAddress, rtspUrl, direction } = req.body;
    const camera = await prisma.camera.create({
      data: { id, name, location, ipAddress, rtspUrl, direction: direction || 'BOTH' }
    });
    res.json({ success: true, data: camera });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update camera
router.put('/cameras/:id', async (req, res) => {
  try {
    const { name, location, ipAddress, rtspUrl, direction, active } = req.body;
    const camera = await prisma.camera.update({
      where: { id: req.params.id },
      data: { name, location, ipAddress, rtspUrl, direction, active }
    });
    res.json({ success: true, data: camera });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete camera
router.delete('/cameras/:id', async (req, res) => {
  try {
    await prisma.camera.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Get Unknown Face Alerts ─────────────────────────────────────────────
router.get('/alerts/unknown', async (req, res) => {
  try {
    const { resolved, limit = 50 } = req.query;
    const where = {};
    if (resolved !== undefined) where.resolved = resolved === 'true';

    const alerts = await prisma.unknownFaceAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: { camera: true }
    });
    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Resolve an unknown face alert
router.put('/alerts/unknown/:id/resolve', async (req, res) => {
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

// ── Get Face Events (for monitoring dashboard) ──────────────────────────
router.get('/face-events', async (req, res) => {
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
    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
