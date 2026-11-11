// =============================================================================
// src/routes/performanceNoteRoutes.js
// Performance note routes.
// HR_ADMIN + LINE_MANAGER: full CRUD on any note within scope.
// NEW_EMPLOYEE: view own notes, add EMPLOYEE_FEEDBACK, respond to individual notes.
// Employee routes MUST be declared BEFORE generic /:noteId to avoid Express
// matching /my or /:noteId/respond as a noteId param.
// FR-12 | NFR-02, NFR-03 | Objective 2
// =============================================================================

const express    = require('express');
const router     = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  createNote,
  getNotesByProfile,
  updateNote,
  deleteNote,
  getMyNotes,
  addEmployeeFeedback,
  respondToNote,
} = require('../controllers/performanceNoteController');

// ── Employee-facing routes (declared first to avoid /:noteId conflict) ───────

// Employee: list own notes
router.get(
  '/my',
  authenticate,
  authorize('NEW_EMPLOYEE'),
  getMyNotes,
);

// Employee: submit own EMPLOYEE_FEEDBACK note
router.post(
  '/my/feedback',
  authenticate,
  authorize('NEW_EMPLOYEE'),
  addEmployeeFeedback,
);

// Employee: add response to a specific note on their profile
router.patch(
  '/:noteId/respond',
  authenticate,
  authorize('NEW_EMPLOYEE'),
  respondToNote,
);

// ── HR Admin + Line Manager routes ───────────────────────────────────────────

// Create a note
router.post(
  '/',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  createNote,
);

// List notes for a specific employee profile
router.get(
  '/profile/:profileId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getNotesByProfile,
);

// Update a note (HR unrestricted; LINE_MANAGER own notes only — enforced in controller)
router.patch(
  '/:noteId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  updateNote,
);

// Delete a note (HR unrestricted; LINE_MANAGER own notes only — enforced in controller)
router.delete(
  '/:noteId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  deleteNote,
);

module.exports = router;
