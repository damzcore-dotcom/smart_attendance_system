// Trigger nodemon restart to load node-zklib socket fixes
require('dotenv').config();

// Paksa timezone proses ke Asia/Jakarta (WIB) sebelum Date apa pun dibuat.
// Perhitungan keterlambatan/status memakai Date.getHours()/getDay() yang bergantung TZ proses;
// ini menjamin akurasi absensi walau host/kontainer tidak menyetel TZ. Bisa di-override via .env.
process.env.TZ = process.env.TZ || 'Asia/Jakarta';

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const prisma = require('./prismaClient');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const correctionRoutes = require('./routes/correctionRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const backupRoutes = require('./routes/backupRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const { startCronJobs } = require('./utils/cronJobs');

const app = express();
const PORT = process.env.PORT || 5000;

// Start cron jobs
startCronJobs();

// Auto-fix database sequences on startup to prevent unique constraint errors
const fixSequences = require('./utils/fixSequences');
fixSequences();

// Verify timezone configuration alignment (Asia/Jakarta)
const checkTimezone = require('./utils/timezoneCheck');
checkTimezone();

// Initialize Web Face Verification Cache in RAM on startup
const { initializeFaceCache } = require('./utils/faceCache');
initializeFaceCache();

// Global safety shield to prevent crashes from external libraries
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message, err.stack);
  // Graceful shutdown: stop accepting new requests, then exit so PM2/systemd can restart
  console.error('🔄 Server akan restart dalam 3 detik...');
  setTimeout(() => {
    process.exit(1);
  }, 3000);
});

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (server-to-server, mobile apps, curl)
    if (!origin) return callback(null, true);

    // Check explicit whitelist from env
    const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Auto-allow any host accessing on common frontend dev ports (5173, 3000)
    // This enables access via public IP, LAN IP, or any hostname without manual config.
    // Security is enforced by JWT authentication, not CORS origin restrictions.
    try {
      const url = new URL(origin);
      if (url.port === '5173' || url.port === '3000') {
        return callback(null, true);
      }
    } catch (e) { /* invalid origin URL, fall through to reject */ }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Nonaktifkan cache untuk seluruh API endpoints demi integritas data real-time & privasi
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const path = require('path');
const fs = require('fs');
// Auto-create uploads directory on startup
const profilesDir = path.join(process.cwd(), 'public', 'uploads', 'profiles');
if (!fs.existsSync(profilesDir)) {
  fs.mkdirSync(profilesDir, { recursive: true });
  console.log('📁 Created uploads directory:', profilesDir);
}
const documentsDir = path.join(process.cwd(), 'public', 'uploads', 'documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
  console.log('📁 Created documents directory:', documentsDir);
}
const receiptsDir = path.join(process.cwd(), 'public', 'uploads', 'receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
  console.log('📁 Created receipts directory:', receiptsDir);
}
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// ── MinIO Proxy — Serve face snapshots from MinIO storage ───────────────
const http = require('http');
app.get(/^\/minio\/([^/]+)\/(.+)$/, (req, res) => {
  const bucket = req.params[0];
  const objectKey = req.params[1];
  if (!bucket || !objectKey) {
    return res.status(400).json({ success: false, message: 'Invalid path' });
  }

  // Only allow known buckets
  const allowedBuckets = ['face-snapshots', 'unknown-faces', 'leave-attachments'];
  if (!allowedBuckets.includes(bucket)) {
    return res.status(403).json({ success: false, message: 'Bucket not allowed' });
  }

  const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const minioPort = process.env.MINIO_PORT || '9000';
  const minioUrl = `http://${minioEndpoint}:${minioPort}/${bucket}/${objectKey}`;

  http.get(minioUrl, (minioRes) => {
    if (minioRes.statusCode !== 200) {
      return res.status(minioRes.statusCode || 404).json({ success: false, message: 'Image not found' });
    }
    res.setHeader('Content-Type', minioRes.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
    minioRes.pipe(res);
  }).on('error', (err) => {
    console.error('[MinIO Proxy] Error:', err.message);
    res.status(502).json({ success: false, message: 'Failed to fetch image from storage' });
  });
});

// Health check (basic)
app.get('/api/health', (req, res) => {
  const checkTimezone = require('./utils/timezoneCheck');
  const tz = checkTimezone();
  res.json({
    status: 'OK',
    message: 'Smart HRIS Platform API is running',
    timestamp: new Date(),
    timezone: {
      current: tz.current,
      expected: tz.expected,
      isMatch: tz.isMatch,
      instructions: tz.isMatch ? null : tz.instructions
    }
  });
});

// Deep health check — verifies DB connectivity, memory, uptime
app.get('/api/health/deep', async (req, res) => {
  const results = { status: 'OK', checks: {} };
  
  // 1. Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    results.checks.database = { status: 'OK' };
  } catch (err) {
    results.checks.database = { status: 'FAIL', error: err.message };
    results.status = 'DEGRADED';
  }
  
  // 2. Memory usage
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  results.checks.memory = {
    status: heapPercent > 90 ? 'WARNING' : 'OK',
    heapUsed: `${heapUsedMB}MB`,
    heapTotal: `${heapTotalMB}MB`,
    heapPercent: `${heapPercent}%`
  };
  
  // 3. Uptime
  results.checks.uptime = {
    status: 'OK',
    seconds: Math.round(process.uptime()),
    human: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`
  };
  
  const httpStatus = results.status === 'OK' ? 200 : 503;
  res.status(httpStatus).json(results);
});

// Global rate limiter — prevent API abuse (100 requests per minute per IP)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { success: false, message: 'Terlalu banyak permintaan. Silakan coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' // Don't rate-limit health checks
});
app.use('/api', globalLimiter);

// Rate limiting for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15, // limit each IP to 15 login attempts per window
  message: { success: false, message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for file upload endpoints (disk space exhaustion protection)
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // limit each IP to 10 uploads per window
  message: { success: false, message: 'Terlalu banyak unggahan file. Silakan coba lagi dalam 10 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Demo mode guard — blocks restricted features when DEMO_MODE=true (no effect in production)
const { demoGuard } = require('./middleware/demoGuard');
app.use('/api', demoGuard);

// Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-face', authLimiter);
app.post('/api/claims', uploadLimiter);
app.post('/api/profile-updates', uploadLimiter);
app.post('/api/employees/:id/documents', uploadLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/corrections', correctionRoutes);
app.use('/api/shifts', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/manager', require('./routes/managerRoutes'));
app.use('/api/direktur', require('./routes/direkturRoutes'));
app.use('/api/devices', deviceRoutes);
app.use('/api/fingerprint', require('./routes/fingerprintRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/bhl-payroll', require('./routes/bhlPayrollRoutes'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/bridge', require('./routes/bridgeRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/claims', require('./routes/claimRoutes'));
app.use('/api/profile-updates', require('./routes/profileUpdateRoutes'));
app.use('/api/kpi', require('./routes/kpiRoutes'));
// Global error handler — production-safe (no stack traces leaked)
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message, err.stack);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isProd ? 'Internal Server Error' : (err.message || 'Internal Server Error'),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found` });
});

// Start server only if not in production/vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Smart HRIS Platform API`);
    console.log(`   Server running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
