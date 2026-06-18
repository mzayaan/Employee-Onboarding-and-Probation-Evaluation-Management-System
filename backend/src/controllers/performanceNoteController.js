// =============================================================================
// src/controllers/performanceNoteController.js
// CRUD for performance notes attached to an employee's probation record.
// HR Admins and Line Managers can create, view, edit and delete notes.
// FR-12 | NFR-02, NFR-03 | Objective 2
// =============================================================================

const { PerformanceNote, EmployeeProfile, User, EvaluationCheckpoint } = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// Helper: verify caller has scope access to a given employee profile.
// HR_ADMIN: unrestricted.
// LINE_MANAGER: profile.manager_id must equal caller's user_id.
const checkProfileScope = async (profileId, user) => {
  const profile = await EmployeeProfile.findByPk(profileId, {
    attributes: ['profile_id', 'manager_id'],
    include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name'] }],
  });
  if (!profile) return { allowed: false, notFound: true };
  if (user.role === 'LINE_MANAGER' && profile.manager_id !== user.user_id) {
    return { allowed: false, notFound: false };
  }
  return { allowed: true, profile };
};

// =============================================================================
// POST /api/performance-notes
// Create a performance note for an employee's probation record.
// FR-12 | NFR-03
// =============================================================================
const createNote = async (req, res) => {
  try {
    const { profile_id, note_text, evaluation_period_id } = req.body;

    if (!profile_id || !note_text?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'profile_id and note_text are required.',
      });
    }

    const { allowed, notFound } = await checkProfileScope(profile_id, req.user);
    if (notFound) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You may only add notes for employees in your team.',
      });
    }

    // Optionally link to an evaluation checkpoint (may be null)
    if (evaluation_period_id) {
      const checkpoint = await EvaluationCheckpoint.findByPk(evaluation_period_id);
      if (!checkpoint) {
        return res.status(400).json({ success: false, message: 'Invalid evaluation_period_id.' });
      }
    }

    const note = await PerformanceNote.create({
      profile_id:          Number(profile_id),
      recorded_by:         req.user.user_id,
      note_text:           note_text.trim(),
      evaluation_period_id: evaluation_period_id || null,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'EVALUATION_SUBMITTED',
      description: `Performance note created for profile_id ${profile_id} (note_id: ${note.note_id}).`,
      ipAddress:   getIp(req),
    });

    return res.status(201).json({ success: true, message: 'Performance note created.', data: note });
  } catch (error) {
    console.error('[performanceNoteController.createNote]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create performance note.' });
  }
};

// =============================================================================
// GET /api/performance-notes/profile/:profileId
// Return all performance notes for a given employee profile.
// FR-12 | NFR-03
// =============================================================================
const getNotesByProfile = async (req, res) => {
  try {
    const { profileId } = req.params;

    const { allowed, notFound } = await checkProfileScope(profileId, req.user);
    if (notFound) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You may only view notes for employees in your team.',
      });
    }

    const notes = await PerformanceNote.findAll({
      where: { profile_id: profileId },
      include: [
        { model: User, as: 'recorder', attributes: ['user_id', 'first_name', 'last_name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: notes });
  } catch (error) {
    console.error('[performanceNoteController.getNotesByProfile]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve performance notes.' });
  }
};

// =============================================================================
// PATCH /api/performance-notes/:noteId
// Update the text of a performance note.
// HR_ADMIN: unrestricted. LINE_MANAGER: own notes only (recorded_by).
// FR-12 | NFR-03
// =============================================================================
const updateNote = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { note_text } = req.body;

    if (!note_text?.trim()) {
      return res.status(400).json({ success: false, message: 'note_text is required.' });
    }

    const note = await PerformanceNote.findByPk(noteId);
    if (!note) {
      return res.status(404).json({ success: false, message: 'Performance note not found.' });
    }

    // LINE_MANAGER can only edit notes they personally recorded
    if (req.user.role === 'LINE_MANAGER' && note.recorded_by !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You may only edit notes you created.',
      });
    }

    await note.update({ note_text: note_text.trim() });

    return res.json({ success: true, message: 'Performance note updated.', data: note });
  } catch (error) {
    console.error('[performanceNoteController.updateNote]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update performance note.' });
  }
};

// =============================================================================
// DELETE /api/performance-notes/:noteId
// Delete a performance note.
// HR_ADMIN: unrestricted. LINE_MANAGER: own notes only (recorded_by).
// FR-12 | NFR-03
// =============================================================================
const deleteNote = async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await PerformanceNote.findByPk(noteId);
    if (!note) {
      return res.status(404).json({ success: false, message: 'Performance note not found.' });
    }

    // LINE_MANAGER can only delete notes they personally recorded
    if (req.user.role === 'LINE_MANAGER' && note.recorded_by !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You may only delete notes you created.',
      });
    }

    const profileId = note.profile_id;
    await note.destroy();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'EVALUATION_SUBMITTED',
      description: `Performance note ${noteId} deleted from profile_id ${profileId}.`,
      ipAddress:   getIp(req),
    });

    return res.json({ success: true, message: 'Performance note deleted.' });
  } catch (error) {
    console.error('[performanceNoteController.deleteNote]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete performance note.' });
  }
};

module.exports = { createNote, getNotesByProfile, updateNote, deleteNote };
