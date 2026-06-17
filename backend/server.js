// =============================================================================
// server.js — Express application entry point
// Employee Onboarding and Probation Evaluation Management System
// FR-01 to FR-18 | NFR-01 to NFR-08
// =============================================================================

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { sequelize } = require('./src/models');

const app  = express();
const PORT = process.env.PORT || 5000;

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Helmet sets secure HTTP headers (NFR-02)
app.use(helmet());

// CORS — in development allow any localhost port; in production lock to CLIENT_URL (NFR-02)
const corsOrigin = process.env.NODE_ENV === 'production'
  ? process.env.CLIENT_URL
  : (origin, callback) => {
      // Allow requests with no origin (Postman, curl) or any localhost/127.0.0.1 port
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('CORS: origin not allowed'));
    };

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Global rate limiter — applied in production only (NFR-01, NFR-02).
// In development all browser requests share the same localhost IP, so a strict
// per-IP window would be exhausted within minutes of normal testing.
// The auth-specific limiter (10 attempts / 15 min on /login) remains active
// in all environments as the primary brute-force protection.
if (process.env.NODE_ENV === 'production') {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15-minute rolling window
    max:      200,             // 200 requests per IP per window
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'Too many requests. Please try again later.' },
  });
  app.use(globalLimiter);
}

// Auth-specific rate limiting is handled at the route level inside authRoutes.js
// (10 attempts / 15-minute window on /login and /forgot-password).
// No separate limiter is needed here.

// =============================================================================
// RESPONSE-TIME LOGGING MIDDLEWARE (NFR-01)
// Logs method, path, status code and response time for every request.
// Only active in development to avoid log verbosity in production.
// =============================================================================

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    });
    next();
  });
}

// =============================================================================
// BODY PARSING MIDDLEWARE
// =============================================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================================================
// API ROUTES
// Routes are imported and registered here as each module is implemented.
// =============================================================================

// Health check — confirms server and DB connectivity
app.get('/api/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      success: true,
      message: 'Server is running. Database connection established.',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Auth routes (Block 2)
// NOTE: authLimiter is NOT applied here — authRoutes.js already applies a
// stricter per-route limiter (10/15 min) to /login and /forgot-password.
// Adding it here would double-count requests against the window counter.
const authRoutes = require('./src/routes/authRoutes');
app.use('/api/auth', authRoutes);

// Department routes (Block 4)
const departmentRoutes = require('./src/routes/departmentRoutes');
app.use('/api/departments', departmentRoutes);

// Employee routes (Block 4)
const employeeRoutes = require('./src/routes/employeeRoutes');
app.use('/api/employees', employeeRoutes);

// Document routes (Block 5)
const documentRoutes = require('./src/routes/documentRoutes');
app.use('/api/documents', documentRoutes);

// Task routes (Block 5)
const taskRoutes = require('./src/routes/taskRoutes');
app.use('/api/tasks', taskRoutes);

// Dashboard routes (Block 6)
const dashboardRoutes = require('./src/routes/dashboardRoutes');
app.use('/api/dashboard', dashboardRoutes);

// Criteria routes (Block 7 — System Admin)
const criteriaRoutes = require('./src/routes/criteriaRoutes');
app.use('/api/criteria', criteriaRoutes);

// Evaluation routes (Block 8 — Phase 4)
const evaluationRoutes = require('./src/routes/evaluationRoutes');
app.use('/api/evaluations', evaluationRoutes);

// Audit log routes (Block 8 — Phase 4)
const auditRoutes = require('./src/routes/auditRoutes');
app.use('/api/audit', auditRoutes);

// Attendance record routes (FR-12 — Phase 4)
const attendanceRoutes = require('./src/routes/attendanceRoutes');
app.use('/api/attendance', attendanceRoutes);

// PDF evaluation report routes (FR-15, FR-16 — Phase 5)
const pdfRoutes = require('./src/routes/pdfRoutes');
app.use('/api/reports', pdfRoutes);

// Notification trigger route (FR-09 — manual test endpoint for dev/testing)
const notificationRoutes = require('./src/routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// ── Notification scheduler (FR-09) ───────────────────────────────────────────
const { startNotificationScheduler } = require('./src/services/notificationService');

// =============================================================================
// 404 HANDLER
// =============================================================================

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// =============================================================================
// GLOBAL ERROR HANDLER
// =============================================================================

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'An unexpected error occurred.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// =============================================================================
// DATABASE CONNECTION + SERVER START
// =============================================================================

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('[DB] MySQL connection established successfully.');

    app.listen(PORT, () => {
      console.log(`[Server] Running on port ${PORT} in ${process.env.NODE_ENV} mode.`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);

      // Start scheduled email notification jobs (FR-09)
      startNotificationScheduler();
    });
  } catch (error) {
    console.error('[DB] Unable to connect to MySQL:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app; // exported for Supertest integration testing
