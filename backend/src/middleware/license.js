const crypto = require('crypto');
const prisma = require('../prismaClient');

const MASTER_SECRET = 'IGA_SUPER_SECRET_KEY_2026_DO_NOT_SHARE';

let cachedLicenseStatus = null;
let lastCheckTime = 0;

const verifyLicense = async (req, res, next) => {
  // Allow login and public endpoints to bypass license check so admin can fix it
  if (req.path.includes('/api/auth/login') || req.path.includes('/api/settings/public')) {
    return next();
  }

  const now = Date.now();
  // Check cache every 5 seconds to avoid spamming DB but allow quick updates
  if (now - lastCheckTime > 5000) {
    try {
      const setting = await prisma.settings.findUnique({ where: { key: 'licenseKey' } });
      const key = setting?.value;
      
      if (!key) {
        cachedLicenseStatus = { valid: false, message: 'No license key installed. Please contact vendor.' };
      } else {
        const [payloadBase64, signature] = key.split('.');
        const expectedSig = crypto.createHmac('sha256', MASTER_SECRET).update(payloadBase64).digest('hex');
        
        if (signature !== expectedSig) {
          cachedLicenseStatus = { valid: false, message: 'Invalid license signature.' };
        } else {
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
          const expiryDate = new Date(payload.expiry);
          
          if (new Date() > expiryDate) {
            cachedLicenseStatus = { valid: false, message: `License expired on ${payload.expiry}.` };
          } else {
            cachedLicenseStatus = { valid: true };
          }
        }
      }
    } catch (err) {
      cachedLicenseStatus = { valid: false, message: 'License verification error.' };
    }
    lastCheckTime = now;
  }

  if (cachedLicenseStatus && !cachedLicenseStatus.valid) {
    // Only allow SUPER_ADMIN to bypass to update settings, but we need token first.
    // However, token middleware runs BEFORE this. So req.user is available.
    if (req.user && req.user.role === 'SUPER_ADMIN' && req.originalUrl.includes('/api/settings')) {
      return next(); // Let Super Admin update the license key
    }
    return res.status(403).json({ success: false, message: 'SOFTWARE LOCKED: ' + cachedLicenseStatus.message, code: 'LICENSE_ERROR' });
  }

  next();
};

module.exports = { verifyLicense };
