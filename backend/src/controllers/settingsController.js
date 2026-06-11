const prisma = require('../prismaClient');
const crypto = require('crypto');

const { handleControllerError } = require('../middleware/validate');
const MASTER_SECRET = process.env.LICENSE_SECRET || 'd94795ad7e96949a882a1f45a4206a69184172efc14f226f4c49def1bf9bdfc1';

/**
 * GET /api/settings
 */
/**
 * GET /api/settings/public
 */
const getPublicInfo = async (req, res) => {
  try {
    const keys = ['companyName', 'appLogo', 'primaryColor', 'faceMatchThreshold', 'livenessDetection', 'autoEnrollment'];
    const settings = await prisma.settings.findMany({
      where: { key: { in: keys } }
    });
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json({ success: true, data: obj });
  } catch (err) {
    handleControllerError(res, err, 'settingsController');
  }
};

const getAll = async (req, res) => {
  try {
    const settings = await prisma.settings.findMany();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json({ success: true, data: obj });
  } catch (err) {
    handleControllerError(res, err, 'settingsController');
  }
};

/**
 * PUT /api/settings
 */
const update = async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await prisma.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    handleControllerError(res, err, 'settingsController');
  }
};

// ─── Location CRUD ────────────────────────────────

const getLocations = async (req, res) => {
  try {
    const locations = await prisma.location.findMany();
    res.json({ success: true, data: locations });
  } catch (err) {
    handleControllerError(res, err, 'settingsController');
  }
};

const createLocation = async (req, res) => {
  try {
    const { name, address, lat, lng, radius } = req.body;
    const location = await prisma.location.create({
      data: { name, address, lat: parseFloat(lat), lng: parseFloat(lng), radius: parseInt(radius) || 100 },
    });
    res.status(201).json({ success: true, data: location });
  } catch (err) {
    handleControllerError(res, err, 'settingsController');
  }
};

const updateLocation = async (req, res) => {
  try {
    const { name, address, lat, lng, radius } = req.body;
    const location = await prisma.location.update({
      where: { id: parseInt(req.params.id) },
      data: { name, address, lat: parseFloat(lat), lng: parseFloat(lng), radius: parseInt(radius) },
    });
    res.json({ success: true, data: location });
  } catch (err) {
    handleControllerError(res, err, 'settingsController');
  }
};

const deleteLocation = async (req, res) => {
  try {
    await prisma.location.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Location deleted' });
  } catch (err) {
    handleControllerError(res, err, 'settingsController');
  }
};

/**
 * GET /api/settings/license-info
 * Returns license status (client, expiry, limit) for display in UI footer
 */
const getLicenseInfo = async (req, res) => {
  try {
    const setting = await prisma.settings.findUnique({ where: { key: 'licenseKey' } });
    if (!setting?.value) {
      return res.json({ success: true, data: { valid: false, message: 'Belum ada lisensi' } });
    }
    const [payloadB64, signature] = setting.value.split('.');
    const expectedSig = crypto.createHmac('sha256', MASTER_SECRET).update(payloadB64).digest('hex');
    if (signature !== expectedSig) {
      return res.json({ success: true, data: { valid: false, message: 'Lisensi tidak valid' } });
    }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
    const expired = new Date() > new Date(payload.expiry);
    res.json({
      success: true,
      data: {
        valid: !expired,
        client: payload.client,
        expiry: payload.expiry,
        limit: payload.limit,
        expired
      }
    });
  } catch (err) {
    res.json({ success: true, data: { valid: false, message: 'Error membaca lisensi' } });
  }
};

module.exports = { getAll, update, getLocations, createLocation, updateLocation, deleteLocation, getPublicInfo, getLicenseInfo };
