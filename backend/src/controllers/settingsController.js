const prisma = require('../prismaClient');
const crypto = require('crypto');

const MASTER_SECRET = process.env.LICENSE_SECRET || 'CHANGE_THIS_SECRET_IN_ENV';

/**
 * GET /api/settings
 */
/**
 * GET /api/settings/public
 */
const getPublicInfo = async (req, res) => {
  try {
    const keys = ['companyName', 'appLogo', 'primaryColor'];
    const settings = await prisma.settings.findMany({
      where: { key: { in: keys } }
    });
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json({ success: true, data: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getAll = async (req, res) => {
  try {
    const settings = await prisma.settings.findMany();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json({ success: true, data: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Location CRUD ────────────────────────────────

const getLocations = async (req, res) => {
  try {
    const locations = await prisma.location.findMany();
    res.json({ success: true, data: locations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
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
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteLocation = async (req, res) => {
  try {
    await prisma.location.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true, message: 'Location deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
