/**
 * Demo Mode Guard Middleware
 * Blocks restricted features when DEMO_MODE=true
 * Has ZERO effect in production (DEMO_MODE not set)
 */
const demoGuard = (req, res, next) => {
  if (process.env.DEMO_MODE !== 'true') return next();

  // Block backup & restore endpoints
  if (req.originalUrl.startsWith('/api/backup')) {
    return res.status(403).json({
      success: false,
      message: '⚠️ Fitur Backup & Restore tidak tersedia di versi Demo. Hubungi 082124130065 untuk lisensi penuh.',
      code: 'DEMO_RESTRICTED'
    });
  }

  // Tag request as demo for export watermark injection
  req.isDemoMode = true;

  next();
};

module.exports = { demoGuard };
