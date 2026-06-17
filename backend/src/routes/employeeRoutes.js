// =============================================================================
// src/routes/employeeRoutes.js
// FR-01, FR-04 | NFR-02, NFR-03
// =============================================================================

const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployeeProfile,
  toggleUserStatus,
  listManagers,
  listAllUsers,
} = require('../controllers/employeeController');

router.use(authenticate);

// GET  /api/employees/all-users — SYSTEM_ADMIN only: list every user (FR-01 / NFR-03)
// Must be declared before /:id to avoid being swallowed by the param route.
router.get('/all-users', authorize('SYSTEM_ADMIN'), listAllUsers);

// GET  /api/employees/managers  — HR only (must be before /:id)
router.get('/managers', authorize('HR_ADMIN'), listManagers);

// POST /api/employees           — HR only
router.post('/', authorize('HR_ADMIN'), createEmployee);

// GET  /api/employees           — HR and Manager
router.get('/', authorize('HR_ADMIN', 'LINE_MANAGER'), listEmployees);

// GET  /api/employees/:id       — HR, Manager, Employee (own profile only)
router.get('/:id', authorize('HR_ADMIN', 'LINE_MANAGER', 'NEW_EMPLOYEE'), getEmployee);

// PUT  /api/employees/:id/profile — HR only
router.put('/:id/profile', authorize('HR_ADMIN'), updateEmployeeProfile);

// PATCH /api/employees/:userId/status — HR or SYSTEM_ADMIN (FR-01)
router.patch('/:userId/status', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), toggleUserStatus);


module.exports = router;
