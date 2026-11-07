// =============================================================================
// src/routes/systemConfigRoutes.js
// System configuration routes — minimum salary management
// Base path: /api/system-config
//
// GET  /current  → any authenticated user (salary validator needs active rate)
// GET  /history  → SYSTEM_ADMIN only
// POST /         → SYSTEM_ADMIN only (append-only: creates a new history row)
//
// Spec s.1.3, s.2.2 | FR-NEW-02 | NFR-08
// =============================================================================

const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const {
  getCurrentConfig,
  getConfigHistory,
  createConfig,
} = require('../controllers/systemConfigController');

// GET  /api/system-config/current — any authenticated role
router.get('/current', authenticate, getCurrentConfig);

// GET  /api/system-config/history — SYSTEM_ADMIN only
router.get('/history', authenticate, authorize('SYSTEM_ADMIN'), getConfigHistory);

// POST /api/system-config — SYSTEM_ADMIN only
router.post('/', authenticate, authorize('SYSTEM_ADMIN'), createConfig);

module.exports = router;
