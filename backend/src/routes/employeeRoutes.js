// =============================================================================
// src/routes/employeeRoutes.js
// FR-01, FR-04 | NFR-02, NFR-03
// Updated: validateNIC and validateProbationDuration injected on POST /
//          to enforce Mauritian NIC format and WRA 2019 probation duration
//          boundary (max 6 months) at the API layer.
// =============================================================================

const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const validateNIC  = require('../middleware/validateNIC');
const { validateProbationDuration } = require('../middleware/validateProbationBoundary');
const uploadImage  = require('../middleware/uploadImage');
const {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployeeProfile,
  updateMyProfile,
  updateMyAvatar,
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
// validateNIC: checks Mauritian NIC format (FR-04 / NFR-02)
// validateProbationDuration: enforces WRA 2019 s.13 max 6-month probation (NFR-08)
router.post('/', authorize('HR_ADMIN'), validateNIC, validateProbationDuration, uploadImage.single('profile_image'), createEmployee);

// GET  /api/employees           — HR, Manager, and Director (Director needs the employee list for approval context)
router.get('/', authorize('HR_ADMIN', 'LINE_MANAGER', 'DIRECTOR'), listEmployees);

// GET  /api/employees/:id       — HR, Manager, Employee (own profile only), Director (for approval review)
router.get('/:id', authorize('HR_ADMIN', 'LINE_MANAGER', 'NEW_EMPLOYEE', 'DIRECTOR'), getEmployee);

// PUT  /api/employees/:id/profile — HR only
router.put('/:id/profile', authorize('HR_ADMIN'), updateEmployeeProfile);

// PATCH /api/employees/me/profile — NEW_EMPLOYEE self-service (Spec s.4.4)
// Must be declared BEFORE /:id to avoid being consumed by the param route.
router.patch('/me/profile', authorize('NEW_EMPLOYEE'), updateMyProfile);

// PATCH /api/employees/me/avatar — self-service profile image upload (Spec s.4.1)
// Open to any role that has an EmployeeProfile (NEW_EMPLOYEE, LINE_MANAGER, HR_ADMIN, DIRECTOR).
router.patch(
  '/me/avatar',
  authorize('NEW_EMPLOYEE', 'LINE_MANAGER', 'HR_ADMIN', 'DIRECTOR'),
  uploadImage.single('profile_image'),
  updateMyAvatar
);

// PATCH /api/employees/:userId/status — HR or SYSTEM_ADMIN (FR-01)
router.patch('/:userId/status', authorize('HR_ADMIN', 'SYSTEM_ADMIN'), toggleUserStatus);


module.exports = router;
