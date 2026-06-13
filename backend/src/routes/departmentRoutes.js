// =============================================================================
// src/routes/departmentRoutes.js
// FR-04 | NFR-03
// =============================================================================

const express    = require('express');
const router     = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const {
  listDepartments,
  createDepartment,
  updateDepartment,
} = require('../controllers/departmentController');

// All department routes require a valid JWT
router.use(authenticate);

// GET  /api/departments  — HR, Manager, Admin can read
router.get('/', authorize('HR_ADMIN', 'LINE_MANAGER', 'SYSTEM_ADMIN'), listDepartments);

// POST /api/departments  — HR and Admin only
router.post('/', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), createDepartment);

// PUT  /api/departments/:id — HR and Admin only
router.put('/:id', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), updateDepartment);

module.exports = router;
