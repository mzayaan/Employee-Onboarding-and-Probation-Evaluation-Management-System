// =============================================================================
// src/controllers/performanceNoteController.js
// CRUD for performance notes attached to an employee's probation record.
// HR Admins and Line Managers: create / view / edit / delete all note fields.
// NEW_EMPLOYEE: view own notes, create EMPLOYEE_FEEDBACK notes, respond to notes.
// FR-12 | NFR-02, NFR-03 | Objective 2
// =============================================================================

const { PerformanceNote, EmployeeProfile, User, EvaluationCheckpoint } = require('../models');
const { createAuditLog }     = require('../utils/auditLogger');
const { createNotification } = require('../services/notificationService');

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
    const {
      profile_id,
      note_text,
      evaluation_period_id,
      // KPI category fields (FR-12 enhancement)
      note_category,
      kpi_target,
      kpi_achievement,
      kpi_rating,
      employee_response,
    } = req.body;

    if (!profile_id || !note_text?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'profile_id and note_text are required.',
      });
    }

    // Validate kpi_rating range if provided
    if (kpi_rating !== undefined && kpi_rating !== null) {
      const rating = Number(kpi_rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'kpi_rating must be between 1 and 5.' });
      }
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
      profile_id:           Number(profile_id),
      recorded_by:          req.user.user_id,
      note_text:            note_text.trim(),
      evaluation_period_id: evaluation_period_id || null,
      note_category:        note_category        || 'GENERAL',
      kpi_target:           kpi_target?.trim()   || null,
      kpi_achievement:      kpi_achievement?.trim() || null,
      kpi_rating:           kpi_rating           || null,
      employee_response:    employee_response?.trim() || null,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'EVALUATION_SUBMITTED',   // closest available ENUM value — note creation
      description: `[NOTE_CREATED] Performance note created for profile_id ${profile_id} (note_id: ${note.note_id}).`,
      ipAddress:   getIp(req),
    });

    // Notify the employee that a performance note has been added to their profile
    EmployeeProfile.findByPk(Number(profile_id), { attributes: ['user_id'] })
      .then((ep) => {
        if (!ep) return;
        const recorderName = `${req.user.first_name} ${req.user.last_name}`;
        const categoryLabel = note_category && note_category !== 'GENERAL' ? ` (${note_category.replace(/_/g, ' ')})` : '';
        createNotification({
          userId:            ep.user_id,
          type:              'PERFORMANCE_NOTE_ADDED',
          message:           `A performance note${categoryLabel} has been added to your profile by ${recorderName}.`,
          relatedEntityType: 'performance_note',
          relatedEntityId:   note.note_id,
        }).catch(() => {});
      })
      .catch(() => {});

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

    // Employee feedback notes are permanently read-only for HR/Manager
    if (note.note_category === 'EMPLOYEE_FEEDBACK') {
      return res.status(403).json({
        success: false,
        message: 'Employee feedback notes cannot be edited.',
      });
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

    // Employee feedback notes are permanently read-only for HR/Manager
    if (note.note_category === 'EMPLOYEE_FEEDBACK') {
      return res.status(403).json({
        success: false,
        message: 'Employee feedback notes cannot be deleted.',
      });
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
      actionType:  'EVALUATION_SUBMITTED',   // closest available ENUM value — note deletion
      description: `[NOTE_DELETED] Performance note ${noteId} deleted from profile_id ${profileId}.`,
      ipAddress:   getIp(req),
    });

    return res.json({ success: true, message: 'Performance note deleted.' });
  } catch (error) {
    console.error('[performanceNoteController.deleteNote]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete performance note.' });
  }
};

// =============================================================================
// GET /api/performance-notes/my
// Employee: return all notes recorded for their own profile.
// Read-only — employee cannot see other employees' notes.
// FR-12 | NFR-03 | NEW_EMPLOYEE
// =============================================================================
const getMyNotes = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const profile = await EmployeeProfile.findOne({ where: { user_id: userId } });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const notes = await PerformanceNote.findAll({
      where: { profile_id: profile.profile_id },
      include: [
        { model: User, as: 'recorder', attributes: ['user_id', 'first_name', 'last_name', 'role'] },
      ],
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: notes });
  } catch (error) {
    console.error('[performanceNoteController.getMyNotes]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve your performance notes.' });
  }
};

// =============================================================================
// POST /api/performance-notes/my/feedback
// Employee: create an EMPLOYEE_FEEDBACK note on their own profile.
// note_category is forced to 'EMPLOYEE_FEEDBACK'; recorded_by = employee's user_id.
// FR-12 | NFR-03 | NEW_EMPLOYEE
// =============================================================================
const addEmployeeFeedback = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const profile = await EmployeeProfile.findOne({ where: { user_id: userId } });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const { note_text, evaluation_period_id } = req.body;

    if (!note_text?.trim()) {
      return res.status(400).json({ success: false, message: 'note_text is required.' });
    }

    if (evaluation_period_id) {
      const checkpoint = await EvaluationCheckpoint.findByPk(evaluation_period_id);
      if (!checkpoint) {
        return res.status(400).json({ success: false, message: 'Invalid evaluation_period_id.' });
      }
    }

    const created = await PerformanceNote.create({
      profile_id:           profile.profile_id,
      recorded_by:          userId,
      note_text:            note_text.trim(),
      note_category:        'EMPLOYEE_FEEDBACK',
      evaluation_period_id: evaluation_period_id || null,
    });

    // Re-fetch with recorder association so the frontend can display the name immediately
    const note = await PerformanceNote.findByPk(created.note_id, {
      include: [{ model: User, as: 'recorder', attributes: ['user_id', 'first_name', 'last_name', 'role'] }],
    });

    await createAuditLog({
      userId,
      actionType:  'EVALUATION_SUBMITTED',
      description: `[EMPLOYEE_FEEDBACK_ADDED] Employee added feedback note (note_id: ${created.note_id}, profile_id: ${profile.profile_id}).`,
      ipAddress:   getIp(req),
    });

    // Notify the employee's line manager that feedback has been submitted
    if (profile.manager_id) {
      const empName = `${req.user.first_name} ${req.user.last_name}`;
      createNotification({
        userId:            profile.manager_id,
        type:              'PERFORMANCE_NOTE_ADDED',
        message:           `${empName} has submitted employee feedback on their performance record. Please log in to review it.`,
        relatedEntityType: 'performance_note',
        relatedEntityId:   created.note_id,
      }).catch(() => {});
    }

    return res.status(201).json({ success: true, message: 'Feedback submitted.', data: note });
  } catch (error) {
    console.error('[performanceNoteController.addEmployeeFeedback]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit feedback.' });
  }
};

// =============================================================================
// PATCH /api/performance-notes/:noteId/respond
// Employee: update employee_response on a note that belongs to their profile.
// Cannot alter note_text, kpi_rating or any manager-owned fields.
// FR-12 | NFR-03 | NEW_EMPLOYEE
// =============================================================================
const respondToNote = async (req, res) => {
  try {
    const userId     = req.user.user_id;
    const { noteId } = req.params;
    const { employee_response } = req.body;

    if (!employee_response?.trim()) {
      return res.status(400).json({ success: false, message: 'employee_response is required.' });
    }

    // Verify note exists
    const note = await PerformanceNote.findByPk(noteId);
    if (!note) {
      return res.status(404).json({ success: false, message: 'Performance note not found.' });
    }

    // Verify note belongs to this employee's profile
    const profile = await EmployeeProfile.findOne({ where: { user_id: userId } });
    if (!profile || note.profile_id !== profile.profile_id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You may only respond to notes on your own profile.',
      });
    }

    await note.update({ employee_response: employee_response.trim() });

    await createAuditLog({
      userId,
      actionType:  'EVALUATION_SUBMITTED',
      description: `[EMPLOYEE_RESPONSE_ADDED] Employee responded to note_id ${noteId}.`,
      ipAddress:   getIp(req),
    });

    // Notify the note's recorder that the employee has responded
    if (note.recorded_by && note.recorded_by !== userId) {
      const empName = `${req.user.first_name} ${req.user.last_name}`;
      createNotification({
        userId:            note.recorded_by,
        type:              'PERFORMANCE_NOTE_RESPONDED',
        message:           `${empName} has responded to your performance note.`,
        relatedEntityType: 'performance_note',
        relatedEntityId:   note.note_id,
      }).catch(() => {});
    }

    return res.json({ success: true, message: 'Response saved.', data: note });
  } catch (error) {
    console.error('[performanceNoteController.respondToNote]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to save response.' });
  }
};

module.exports = {
  createNote,
  getNotesByProfile,
  updateNote,
  deleteNote,
  // Employee-facing
  getMyNotes,
  addEmployeeFeedback,
  respondToNote,
};
