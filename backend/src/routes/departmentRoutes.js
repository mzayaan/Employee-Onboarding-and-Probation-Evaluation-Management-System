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
  assignManager,
  removeManager,
} = require('../controllers/departmentController');

// All department routes require a valid JWT
router.use(authenticate);

// GET  /api/departments  — HR, Manager, Admin, Director can read
router.get('/', authorize('HR_ADMIN', 'LINE_MANAGER', 'SYSTEM_ADMIN', 'DIRECTOR'), listDepartments);

// POST /api/departments  — HR and Admin only
router.post('/', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), createDepartment);

// PUT  /api/departments/:id — HR and Admin only (name/description only)
router.put('/:id', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), updateDepartment);

// PATCH /api/departments/:id/manager — assign dedicated manager to dept (FR-19)
// One manager per department enforced at DB and service level
router.patch('/:id/manager', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), assignManager);

// DELETE /api/departments/:id/manager — unassign current manager from dept
router.delete('/:id/manager', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), removeManager);

module.exports = router;
