/**
 * Bridge Routes — Internal API for AI Engine ↔ Smart Attendance communication.
 * These endpoints are protected by X-Bridge-Key header (not JWT).
 * Only the AI Face Recognition microservice should call these endpoints.
 */
const express = require('express');
const router = express.Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const {
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
} = require('../controllers/bridgeController');

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

// ── Health Check ────────────────────────────────────────────────────────
router.get('/health', verifyBridgeKey, getHealth);

// ── Get Employee + Active Shift ─────────────────────────────────────────
router.get('/employee/:id', verifyBridgeKey, getEmployee);

// ── Record Check-In from CCTV ───────────────────────────────────────────
router.post('/checkin', verifyBridgeKey, postCheckin);

// ── Log Face Event (audit trail) ────────────────────────────────────────
router.post('/face-event', verifyBridgeKey, postFaceEvent);

// ── Unknown Face Alert ──────────────────────────────────────────────────
router.post('/alert/unknown', verifyBridgeKey, postUnknownAlert);

// ── Save Face Enrollment ────────────────────────────────────────────────
router.post('/enrollment/save', verifyBridgeKey, postEnrollmentSave);

// ── Get All Embeddings (for Redis cache reload) ─────────────────────────
router.get('/embeddings', verifyBridgeKey, getEmbeddings);

// ── Broadcast Event (for WebSocket relay) ────────────────────────────────
router.post('/event/broadcast', verifyBridgeKey, postEventBroadcast);

// ══════════════════════════════════════════════════════════════════════════
// Camera Management Endpoints (for Admin Panel)
// ══════════════════════════════════════════════════════════════════════════

// Get all cameras (accessible by Admin JWT or AI Engine Bridge Key)
router.get('/cameras', verifyTokenOrBridgeKey, getCameras);

// Test camera connection (via AI Engine proxy)
router.post('/cameras/test', verifyToken, requireAdmin, postCamerasTest);

// Get camera ROI configurations
router.get('/cameras/rois', verifyToken, requireAdmin, getCamerasRois);

// Update camera ROI configuration
router.post('/cameras/rois', verifyToken, requireAdmin, postCamerasRois);

// Create camera
router.post('/cameras', verifyToken, requireAdmin, postCameras);

// Update camera
router.put('/cameras/:id', verifyToken, requireAdmin, putCamera);

// Delete camera
router.delete('/cameras/:id', verifyToken, requireAdmin, deleteCamera);

// ── Get Unknown Face Alerts ─────────────────────────────────────────────
router.get('/alerts/unknown', verifyToken, getUnknownAlerts);

// Resolve an unknown face alert
router.put('/alerts/unknown/:id/resolve', verifyToken, putUnknownAlertResolve);

// Delete a single unknown face alert
router.delete('/alerts/unknown/:id', verifyToken, requireAdmin, deleteUnknownAlert);

// Bulk delete unknown face alerts
router.delete('/alerts/unknown', verifyToken, requireAdmin, deleteUnknownAlertsBulk);

// ── Re-enrollment Suggestions (proxy to AI Engine) ──────────────────────
router.get('/re-enrollment-suggestions', verifyToken, getReenrollmentSuggestions);

// ── Get Face Events (for monitoring dashboard) ──────────────────────────
router.get('/face-events', verifyToken, getFaceEvents);

module.exports = router;
