require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

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

// Global safety shield to prevent crashes from external libraries
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err.message);
  // Keep server alive instead of exiting
});

// Middleware
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()),
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
const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'profiles');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Created uploads directory:', uploadsDir);
}
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  const checkTimezone = require('./utils/timezoneCheck');
  const tz = checkTimezone();
  res.json({
    status: 'OK',
    message: 'Smart Attendance Pro API is running',
    timestamp: new Date(),
    timezone: {
      current: tz.current,
      expected: tz.expected,
      isMatch: tz.isMatch,
      instructions: tz.isMatch ? null : tz.instructions
    }
  });
});

// Rate limiting for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 login attempts per window
  message: { success: false, message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/verify-face', authLimiter);
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
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/bridge', require('./routes/bridgeRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
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
    console.log(`\n🚀 Smart Attendance Pro API`);
    console.log(`   Server running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
