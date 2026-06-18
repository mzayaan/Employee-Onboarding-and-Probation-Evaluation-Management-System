// =============================================================================
// src/routes/performanceNoteRoutes.js
// Performance note CRUD — HR Admin and Line Manager only.
// FR-12 | NFR-03 | Objective 2
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
} = require('../controllers/performanceNoteController');

// All routes require authentication and HR_ADMIN or LINE_MANAGER role
router.use(authenticate);
router.use(authorize('HR_ADMIN', 'LINE_MANAGER'));

// Create a note
router.post('/', createNote);

// List notes for a specific employee profile
router.get('/profile/:profileId', getNotesByProfile);

// Update a note (HR unrestricted; LINE_MANAGER own notes only — enforced in controller)
router.patch('/:noteId', updateNote);

// Delete a note (HR unrestricted; LINE_MANAGER own notes only — enforced in controller)
router.delete('/:noteId', deleteNote);

module.exports = router;
