// =============================================================================
// src/routes/pdfRoutes.js
// PDF evaluation report generation.
// Base path: /api/reports
// FR-15, FR-16 | NFR-02, NFR-03 | Objective 3
// =============================================================================

const express      = require('express');
const { generateReport } = require('../controllers/pdfController');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const router = express.Router();

// GET /api/reports/period/:periodId
// Generates and streams a PDF evaluation report for the given probation period.
// Accessible to HR_ADMIN (all employees) and LINE_MANAGER (their employees only).
// Requires at least one COMPLETED evaluation checkpoint (FR-16 business rule).
router.get(
  '/period/:periodId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  generateReport
);

module.exports = router;
