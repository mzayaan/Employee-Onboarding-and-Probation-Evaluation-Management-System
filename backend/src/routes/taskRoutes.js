// =============================================================================
// src/routes/taskRoutes.js
// FR-07, FR-08, FR-09, FR-18 | Objective 1
// =============================================================================

const express    = require('express');
const router     = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  assignTask,
  getMyTasks,
  getAllAssignments,
  getAssignmentsByEmployee,
  updateTaskStatus,
  deleteAssignment,
} = require('../controllers/taskController');

// All task routes require authentication
router.use(authenticate);

// ── HR / Manager routes ───────────────────────────────────────────────────────

// Assign a task to an employee
router.post('/assign',
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  assignTask
);

// View all task assignments (optional ?profile_id= filter)
router.get('/assignments',
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getAllAssignments
);

// View tasks for a specific employee
router.get('/assignments/employee/:profileId',
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getAssignmentsByEmployee
);

// Delete a task assignment
router.delete('/assignments/:id',
  authorize('HR_ADMIN'),
  deleteAssignment
);

// ── Employee routes ───────────────────────────────────────────────────────────

// Employee views their own tasks
router.get('/my',
  authorize('NEW_EMPLOYEE'),
  getMyTasks
);

// ── Shared routes ─────────────────────────────────────────────────────────────

// Update task status — employee updates own tasks; HR can also update
router.patch('/assignments/:id/status',
  authorize('NEW_EMPLOYEE', 'HR_ADMIN', 'LINE_MANAGER'),
  updateTaskStatus
);

module.exports = router;
