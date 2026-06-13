// =============================================================================
// src/routes/auditRoutes.js
// FR-18 | NFR-08
// All routes require SYSTEM_ADMIN role.
// =============================================================================

const express                = require('express');
const { getAuditLogs }       = require('../controllers/auditController');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const router = express.Router();

// GET /api/audit
router.get('/', authenticate, authorize('SYSTEM_ADMIN'), getAuditLogs);

module.exports = router;
