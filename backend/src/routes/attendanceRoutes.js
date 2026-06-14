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
} = require('../controllers/attendanceController');

// POST /api/attendance — HR Admin or Line Manager adds a record
router.post(
  '/',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  addAttendanceRecord
);

// GET /api/attendance/period/:periodId — list records for a probation period
router.get(
  '/period/:periodId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getAttendanceByPeriod
);

module.exports = router;
