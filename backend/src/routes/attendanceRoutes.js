// =============================================================================
// src/routes/attendanceRoutes.js
// Base path: /api/attendance
// FR-12 | NFR-02, NFR-03
// =============================================================================

const express = require('express');
const router  = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const {
  addAttendanceRecord,
  getAttendanceByPeriod,
  getAttendanceSummary,
} = require('../controllers/attendanceController');

// POST /api/attendance — HR Admin or Line Manager adds a record
router.post(
  '/',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  addAttendanceRecord
);

// GET /api/attendance/period/:periodId/summary — aggregated counts (optional ?from=&to=)
// Must be registered BEFORE /period/:periodId to avoid param shadowing
router.get(
  '/period/:periodId/summary',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getAttendanceSummary
);

// GET /api/attendance/period/:periodId — list all records for a probation period
router.get(
  '/period/:periodId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getAttendanceByPeriod
);

module.exports = router;
