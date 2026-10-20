// =============================================================================
// src/routes/auditRoutes.js
// FR-18 | NFR-08
// SYSTEM_ADMIN: full audit access
// DIRECTOR: read audit logs for compliance oversight of probation decisions
// =============================================================================

const express                = require('express');
const { getAuditLogs }       = require('../controllers/auditController');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const router = express.Router();

// GET /api/audit — SYSTEM_ADMIN and DIRECTOR (Director needs audit trail visibility for probation decisions)
router.get('/', authenticate, authorize('SYSTEM_ADMIN', 'DIRECTOR'), getAuditLogs);

module.exports = router;
