// =============================================================================
// server.js — HTTP server entry point
// Employee Onboarding and Probation Evaluation Management System
//
// Responsibility: connect to MySQL and start the HTTP listener.
// The Express application (middleware + routes) lives in src/app.js so that
// integration tests can import the configured app without triggering a database
// connection or port binding.
// =============================================================================

require('dotenv').config();

const app  = require('./src/app');
const PORT = process.env.PORT || 5000;

const { sequelize } = require('./src/models');
const { startNotificationScheduler } = require('./src/services/notificationService');

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

      // Start scheduled email notification jobs (FR-09).
      // Guard: skip in test environments so Jest does not hang on open handles,
      // and skip unless ENABLE_SCHEDULER=true is explicitly set in development.
      const shouldStartScheduler =
        process.env.NODE_ENV !== 'test' &&
        (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === 'true');

      if (shouldStartScheduler) {
        startNotificationScheduler();
        console.log('[Scheduler] Notification scheduler started.');
      } else {
        console.log('[Scheduler] Skipped (set ENABLE_SCHEDULER=true to activate in development).');
      }
    });
  } catch (error) {
    console.error('[DB] Unable to connect to MySQL:', error.message);
    process.exit(1);
  }
};

void startServer();

module.exports = app; // exported for Supertest integration testing
