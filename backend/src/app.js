// =============================================================================
// src/app.js
// Express application factory — all middleware and routes configured here.
// Exported for use by server.js (production start) and Supertest (integration
// tests).  Separating app setup from the database connection and app.listen()
// call in server.js allows tests to import the fully configured app without
// triggering a MySQL connection or binding a real port.
// FR-01 to FR-18 | NFR-01 to NFR-08
// =============================================================================

require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// Helmet sets secure HTTP headers (NFR-02)
app.use(helmet());

// CORS — in development allow any localhost port; in production lock to CLIENT_URL
const corsOrigin = process.env.NODE_ENV === 'production'
  ? process.env.CLIENT_URL
  : (origin, callback) => {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      callback(new Error('CORS: origin not allowed'));
    };

app.use(cors({
  origin:       corsOrigin,
  methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:  true,
}));

// Global rate limiter — active only in production or when explicitly enabled
// (avoids false positives in development/test environments).
// The auth-specific limiter (10 attempts / 15 min) lives in authRoutes.js
// and remains active in all non-test environments.
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_GLOBAL_RATE_LIMIT === 'true') {
  const globalLimiter = rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             200,
    standardHeaders: true,
    legacyHeaders:   false,
    message: { success: false, message: 'Too many requests. Please try again later.' },
  });
  app.use(globalLimiter);
}

// =============================================================================
// RESPONSE-TIME LOGGING MIDDLEWARE (NFR-01)
// Skipped in production (log verbosity) and test (noise in Jest output).
// =============================================================================

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`
      );
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
// HEALTH CHECK
// Lazy-loads sequelize here so tests that mock ../models get the mock.
// =============================================================================

app.get('/api/health', async (req, res) => {
  try {
    const { sequelize } = require('./models');
    await sequelize.authenticate();
    res.json({
      success:     true,
      message:     'Server is running. Database connection established.',
      environment: process.env.NODE_ENV,
      timestamp:   new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed.',
      error:   process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// =============================================================================
// API ROUTES
// =============================================================================

const authRoutes           = require('./routes/authRoutes');
const departmentRoutes     = require('./routes/departmentRoutes');
const employeeRoutes       = require('./routes/employeeRoutes');
const documentRoutes       = require('./routes/documentRoutes');
const taskRoutes           = require('./routes/taskRoutes');
const dashboardRoutes      = require('./routes/dashboardRoutes');
const criteriaRoutes       = require('./routes/criteriaRoutes');
const evaluationRoutes     = require('./routes/evaluationRoutes');
const auditRoutes          = require('./routes/auditRoutes');
const attendanceRoutes     = require('./routes/attendanceRoutes');
const pdfRoutes            = require('./routes/pdfRoutes');
const notificationRoutes   = require('./routes/notificationRoutes');
const performanceNoteRoutes = require('./routes/performanceNoteRoutes');
const directorRoutes        = require('./routes/directorRoutes');
// ── Mauritius compliance routes (compliance spec) ─────────────────────────
const contractRoutes        = require('./routes/contractRoutes');
const taxDeclarationRoutes  = require('./routes/taxDeclarationRoutes');
const hrdcTrainingRoutes    = require('./routes/hrdcTrainingRoutes');

app.use('/api/auth',              authRoutes);
app.use('/api/departments',       departmentRoutes);
app.use('/api/employees',         employeeRoutes);
app.use('/api/documents',         documentRoutes);
app.use('/api/tasks',             taskRoutes);
app.use('/api/dashboard',         dashboardRoutes);
app.use('/api/criteria',          criteriaRoutes);
app.use('/api/evaluations',       evaluationRoutes);
app.use('/api/audit',             auditRoutes);
app.use('/api/attendance',        attendanceRoutes);
app.use('/api/reports',           pdfRoutes);
app.use('/api/notifications',     notificationRoutes);
app.use('/api/performance-notes', performanceNoteRoutes);
app.use('/api/director',          directorRoutes);
// ── Mauritius compliance ───────────────────────────────────────────────────
app.use('/api/contracts',         contractRoutes);
app.use('/api/tax-declarations',  taxDeclarationRoutes);
app.use('/api/hrdc-training',     hrdcTrainingRoutes);

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

module.exports = app;
