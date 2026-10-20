// =============================================================================
// src/controllers/directorController.js
//
// Implements the three-stage probation approval state machine:
//   Stage 1 — Manager submits (done in evaluationController)
//             FinalRecommendation.approval_status = PENDING_HR_REVIEW
//   Stage 2 — HR endorses or returns
//             endorse  → PENDING_DIRECTOR
//             return   → RETURNED_TO_MANAGER
//   Stage 2b — Manager resubmits (after RETURNED_TO_MANAGER)
//              → PENDING_HR_REVIEW
//   Stage 3 — Director approves or returns
//             approve  → APPROVED  (unlocks PDF, updates ProbationPeriod)
//             return   → RETURNED_TO_MANAGER
//
// Lecturer requirement: probation decision (confirm/extend/dismiss) must go
// to the Director for final approval before PDF is generated.
//
// FR-15, FR-16, FR-20 | NFR-02, NFR-03 | Objective 3
// =============================================================================

const {
  FinalRecommendation,
  ProbationPeriod,
  EmployeeProfile,
  Department,
  User,
} = require('../models');

const { createAuditLog }    = require('../utils/auditLogger');
const { createNotification } = require('../services/notificationService');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// ---------------------------------------------------------------------------
// HELPER: load a FinalRecommendation with full context for review pages
// ---------------------------------------------------------------------------
const loadRecommendationForReview = (recId) =>
  FinalRecommendation.findByPk(recId, {
    include: [
      {
        model: ProbationPeriod,
        as:    'probationPeriod',
        include: [
          {
            model: EmployeeProfile,
            as:    'employeeProfile',
            include: [
              { model: User,       as: 'user',       attributes: ['user_id', 'first_name', 'last_name', 'email'] },
              { model: Department, as: 'department',  attributes: ['department_id', 'name'] },
              { model: User,       as: 'manager',     attributes: ['user_id', 'first_name', 'last_name', 'email'] },
            ],
          },
        ],
      },
      { model: User, as: 'submittedByManager', attributes: ['user_id', 'first_name', 'last_name', 'email'] },
      { model: User, as: 'endorsedByHR',       attributes: ['user_id', 'first_name', 'last_name'] },
      { model: User, as: 'director',            attributes: ['user_id', 'first_name', 'last_name'] },
    ],
  });

// ---------------------------------------------------------------------------
// HELPER: notify all active HR_ADMIN users (fire-and-forget)
// ---------------------------------------------------------------------------
const notifyHR = async (message, recId) => {
  try {
    const hrUsers = await User.findAll({
      where:      { role: 'HR_ADMIN', is_active: true },
      attributes: ['user_id'],
    });
    for (const hr of hrUsers) {
      createNotification({
        userId:            hr.user_id,
        type:              'RECOMMENDATION_PENDING',
        message,
        relatedEntityType: 'recommendation',
        relatedEntityId:   recId,
      }).catch(() => {});
    }
  } catch (_) {}
};

// ---------------------------------------------------------------------------
// HELPER: notify all active DIRECTOR users (fire-and-forget)
// ---------------------------------------------------------------------------
const notifyDirectors = async (message, recId) => {
  try {
    const directors = await User.findAll({
      where:      { role: 'DIRECTOR', is_active: true },
      attributes: ['user_id'],
    });
    for (const d of directors) {
      createNotification({
        userId:            d.user_id,
        type:              'RECOMMENDATION_PENDING',
        message,
        relatedEntityType: 'recommendation',
        relatedEntityId:   recId,
      }).catch(() => {});
    }
  } catch (_) {}
};

// =============================================================================
// GET /api/director/pending-hr
// HR Admin views all recommendations awaiting HR review or returned to manager.
// FR-20 | NFR-03
// =============================================================================
const listPendingHR = async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const recs = await FinalRecommendation.findAll({
      where: {
        approval_status: {
          [Op.in]: ['PENDING_HR_REVIEW', 'RETURNED_TO_MANAGER'],
        },
      },
      include: [
        {
          model: ProbationPeriod,
          as:    'probationPeriod',
          include: [
            {
              model: EmployeeProfile,
              as:    'employeeProfile',
              include: [
                { model: User,       as: 'user',      attributes: ['first_name', 'last_name', 'email'] },
                { model: Department, as: 'department', attributes: ['name'] },
              ],
            },
          ],
        },
        { model: User, as: 'submittedByManager', attributes: ['first_name', 'last_name'] },
      ],
      order: [['generated_at', 'ASC']],
    });

    return res.json({ success: true, data: recs });
  } catch (error) {
    console.error('[directorController.listPendingHR]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve pending recommendations.' });
  }
};

// =============================================================================
// GET /api/director/pending-director
// Director views all recommendations awaiting Director decision.
// FR-20
// =============================================================================
const listPendingDirector = async (req, res) => {
  try {
    const recs = await FinalRecommendation.findAll({
      where: { approval_status: 'PENDING_DIRECTOR' },
      include: [
        {
          model: ProbationPeriod,
          as:    'probationPeriod',
          include: [
            {
              model: EmployeeProfile,
              as:    'employeeProfile',
              include: [
                { model: User,       as: 'user',      attributes: ['first_name', 'last_name', 'email'] },
                { model: Department, as: 'department', attributes: ['name'] },
              ],
            },
          ],
        },
        { model: User, as: 'submittedByManager', attributes: ['first_name', 'last_name'] },
        { model: User, as: 'endorsedByHR',       attributes: ['first_name', 'last_name'] },
      ],
      order: [['submitted_to_director_at', 'ASC']],
    });

    return res.json({ success: true, data: recs });
  } catch (error) {
    console.error('[directorController.listPendingDirector]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve pending director queue.' });
  }
};

// =============================================================================
// GET /api/director/recommendation/:recId
// HR or Director retrieves the full recommendation context for review.
// FR-20 | NFR-03
// =============================================================================
const getRecommendation = async (req, res) => {
  try {
    const rec = await loadRecommendationForReview(req.params.recId);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }
    return res.json({ success: true, data: rec });
  } catch (error) {
    console.error('[directorController.getRecommendation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve recommendation.' });
  }
};

// =============================================================================
// POST /api/director/:recId/endorse
// HR Admin endorses a recommendation and forwards it to the Director.
// Transition: PENDING_HR_REVIEW → PENDING_DIRECTOR
// Body: { hr_endorsement_notes? }
// FR-20 | NFR-03
// =============================================================================
const endorseRecommendation = async (req, res) => {
  try {
    const { recId } = req.params;
    const { hr_endorsement_notes = '' } = req.body;

    const rec = await FinalRecommendation.findByPk(recId);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'PENDING_HR_REVIEW') {
      return res.status(409).json({
        success: false,
        message: `Cannot endorse: recommendation is currently "${rec.approval_status}". Only PENDING_HR_REVIEW recommendations can be endorsed.`,
      });
    }

    await rec.update({
      approval_status:       'PENDING_DIRECTOR',
      endorsed_by:           req.user.user_id,
      endorsed_at:           new Date(),
      hr_endorsement_notes:  hr_endorsement_notes?.trim() || null,
      submitted_to_director_at: new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_ENDORSED',
      description: `Recommendation ID ${recId} endorsed by HR (${req.user.first_name} ${req.user.last_name}) and forwarded to Director. Type: ${rec.recommendation_type}.`,
      ipAddress:   getIp(req),
    });

    // Notify Director
    notifyDirectors(
      `A probation recommendation (${rec.recommendation_type}) has been endorsed by HR and requires your decision.`,
      recId
    );

    return res.json({
      success: true,
      message: 'Recommendation endorsed and forwarded to the Director for final approval.',
      data:    { rec_id: recId, approval_status: 'PENDING_DIRECTOR' },
    });
  } catch (error) {
    console.error('[directorController.endorseRecommendation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to endorse recommendation.' });
  }
};

// =============================================================================
// POST /api/director/:recId/return-to-manager
// HR Admin returns the recommendation to the manager for revision.
// Transition: PENDING_HR_REVIEW → RETURNED_TO_MANAGER
// Body: { hr_endorsement_notes (reason for return — required) }
// FR-20 | NFR-03
// =============================================================================
const returnToManagerByHR = async (req, res) => {
  try {
    const { recId } = req.params;
    const { hr_endorsement_notes = '' } = req.body;

    if (!hr_endorsement_notes?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'hr_endorsement_notes (reason for return) is required.',
      });
    }

    const rec = await FinalRecommendation.findByPk(recId);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'PENDING_HR_REVIEW') {
      return res.status(409).json({
        success: false,
        message: `Cannot return: recommendation is currently "${rec.approval_status}".`,
      });
    }

    await rec.update({
      approval_status:      'RETURNED_TO_MANAGER',
      endorsed_by:          req.user.user_id,
      endorsed_at:          new Date(),
      hr_endorsement_notes: hr_endorsement_notes.trim(),
      rejection_count:      (rec.rejection_count || 0) + 1,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_RETURNED_BY_HR',
      description: `Recommendation ID ${recId} returned to manager by HR. Reason: ${hr_endorsement_notes.trim()}`,
      ipAddress:   getIp(req),
    });

    // Notify the manager who submitted the recommendation
    if (rec.submitted_by) {
      createNotification({
        userId:            rec.submitted_by,
        type:              'RECOMMENDATION_RETURNED',
        message:           `Your probation recommendation has been returned by HR for revision. Reason: ${hr_endorsement_notes.trim()}`,
        relatedEntityType: 'recommendation',
        relatedEntityId:   recId,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: 'Recommendation returned to manager for revision.',
      data:    { rec_id: recId, approval_status: 'RETURNED_TO_MANAGER' },
    });
  } catch (error) {
    console.error('[directorController.returnToManagerByHR]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to return recommendation.' });
  }
};

// =============================================================================
// POST /api/director/:recId/resubmit
// Line Manager resubmits a returned recommendation (with updated justification).
// Transition: RETURNED_TO_MANAGER → PENDING_HR_REVIEW
// Body: { justification (required) }
// FR-20 | NFR-03
// =============================================================================
const resubmitRecommendation = async (req, res) => {
  try {
    const { recId } = req.params;
    const { justification = '' } = req.body;

    if (!justification?.trim()) {
      return res.status(400).json({ success: false, message: 'justification is required when resubmitting.' });
    }

    const rec = await FinalRecommendation.findByPk(recId);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'RETURNED_TO_MANAGER') {
      return res.status(409).json({
        success: false,
        message: `Cannot resubmit: recommendation status is "${rec.approval_status}". Only RETURNED_TO_MANAGER recommendations can be resubmitted.`,
      });
    }

    // LINE_MANAGER may only resubmit their own recommendation
    if (req.user.role === 'LINE_MANAGER' && rec.submitted_by !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied. You may only resubmit your own recommendation.' });
    }

    await rec.update({
      approval_status: 'PENDING_HR_REVIEW',
      justification:   justification.trim(),
      // Clear previous endorsement fields so HR reviews fresh
      endorsed_by:          null,
      endorsed_at:          null,
      hr_endorsement_notes: null,
      submitted_to_director_at: null,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_RESUBMITTED',
      description: `Recommendation ID ${recId} resubmitted by manager with updated justification.`,
      ipAddress:   getIp(req),
    });

    notifyHR(
      `A probation recommendation (${rec.recommendation_type}) has been resubmitted by a manager and requires your review.`,
      recId
    );

    return res.json({
      success: true,
      message: 'Recommendation resubmitted for HR review.',
      data:    { rec_id: recId, approval_status: 'PENDING_HR_REVIEW' },
    });
  } catch (error) {
    console.error('[directorController.resubmitRecommendation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to resubmit recommendation.' });
  }
};

// =============================================================================
// POST /api/director/:recId/approve
// Director gives final approval of the recommendation.
// Transition: PENDING_DIRECTOR → APPROVED
// Effect: ProbationPeriod.status updated to CONFIRMED / EXTENDED / DISMISSED.
//         PDF generation is now unlocked.
// Body: { director_reason? }
// FR-15, FR-20
// =============================================================================
const approveRecommendation = async (req, res) => {
  try {
    const { recId } = req.params;
    const { director_reason = '' } = req.body;

    const rec = await FinalRecommendation.findByPk(recId, {
      include: [{ model: ProbationPeriod, as: 'probationPeriod' }],
    });
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'PENDING_DIRECTOR') {
      return res.status(409).json({
        success: false,
        message: `Cannot approve: recommendation is currently "${rec.approval_status}". Only PENDING_DIRECTOR recommendations can be approved.`,
      });
    }

    // Derive the new ProbationPeriod status from recommendation_type
    const periodStatusMap = {
      CONFIRM: 'CONFIRMED',
      EXTEND:  'EXTENDED',
      DISMISS: 'DISMISSED',
    };
    const newPeriodStatus = periodStatusMap[rec.recommendation_type] || 'COMPLETED';

    const { sequelize } = require('../models');
    await sequelize.transaction(async (t) => {
      await rec.update({
        approval_status:    'APPROVED',
        director_id:        req.user.user_id,
        director_decision_at: new Date(),
        director_reason:    director_reason?.trim() || null,
      }, { transaction: t });

      // Update ProbationPeriod to reflect the Director's decision
      if (rec.probationPeriod) {
        await rec.probationPeriod.update({
          status:     newPeriodStatus,
          updated_at: new Date(),
        }, { transaction: t });
      }
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_APPROVED',
      description: `Director ${req.user.first_name} ${req.user.last_name} approved recommendation ID ${recId} (${rec.recommendation_type}). Probation period updated to ${newPeriodStatus}. PDF report unlocked.`,
      ipAddress:   getIp(req),
    });

    // Notify HR and the originating manager
    const approvalMsg = `The probation recommendation (${rec.recommendation_type}) has been approved by the Director. The PDF report is now available.`;
    notifyHR(approvalMsg, recId);
    if (rec.submitted_by) {
      createNotification({
        userId:            rec.submitted_by,
        type:              'RECOMMENDATION_APPROVED',
        message:           approvalMsg,
        relatedEntityType: 'recommendation',
        relatedEntityId:   recId,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: `Recommendation approved. Probation period is now "${newPeriodStatus}". PDF report is now available for download.`,
      data:    { rec_id: recId, approval_status: 'APPROVED', period_status: newPeriodStatus },
    });
  } catch (error) {
    console.error('[directorController.approveRecommendation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to approve recommendation.' });
  }
};

// =============================================================================
// POST /api/director/:recId/return
// Director returns the recommendation (e.g. requests more information).
// Transition: PENDING_DIRECTOR → RETURNED_TO_MANAGER
// Body: { director_reason (required) }
// FR-20
// =============================================================================
const returnByDirector = async (req, res) => {
  try {
    const { recId } = req.params;
    const { director_reason = '' } = req.body;

    if (!director_reason?.trim()) {
      return res.status(400).json({ success: false, message: 'director_reason is required when returning a recommendation.' });
    }

    const rec = await FinalRecommendation.findByPk(recId);
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'PENDING_DIRECTOR') {
      return res.status(409).json({
        success: false,
        message: `Cannot return: recommendation is currently "${rec.approval_status}".`,
      });
    }

    await rec.update({
      approval_status:      'RETURNED_TO_MANAGER',
      director_id:          req.user.user_id,
      director_decision_at: new Date(),
      director_reason:      director_reason.trim(),
      rejection_count:      (rec.rejection_count || 0) + 1,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_RETURNED_BY_DIRECTOR',
      description: `Director ${req.user.first_name} ${req.user.last_name} returned recommendation ID ${recId} to manager. Reason: ${director_reason.trim()}`,
      ipAddress:   getIp(req),
    });

    // Notify HR and originating manager
    const returnMsg = `The Director has returned the probation recommendation for further revision. Reason: ${director_reason.trim()}`;
    notifyHR(returnMsg, recId);
    if (rec.submitted_by) {
      createNotification({
        userId:            rec.submitted_by,
        type:              'RECOMMENDATION_RETURNED',
        message:           returnMsg,
        relatedEntityType: 'recommendation',
        relatedEntityId:   recId,
      }).catch(() => {});
    }

    return res.json({
      success: true,
      message: 'Recommendation returned to manager.',
      data:    { rec_id: recId, approval_status: 'RETURNED_TO_MANAGER', rejection_count: rec.rejection_count },
    });
  } catch (error) {
    console.error('[directorController.returnByDirector]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to return recommendation.' });
  }
};

// =============================================================================
// GET /api/director/all
// HR or Director views all recommendations (any status) — for overview page.
// FR-20 | NFR-03
// =============================================================================
const listAllRecommendations = async (req, res) => {
  try {
    const recs = await FinalRecommendation.findAll({
      include: [
        {
          model: ProbationPeriod,
          as:    'probationPeriod',
          include: [
            {
              model: EmployeeProfile,
              as:    'employeeProfile',
              include: [
                { model: User,       as: 'user',      attributes: ['first_name', 'last_name', 'email'] },
                { model: Department, as: 'department', attributes: ['name'] },
              ],
            },
          ],
        },
        { model: User, as: 'submittedByManager', attributes: ['first_name', 'last_name'] },
        { model: User, as: 'endorsedByHR',       attributes: ['first_name', 'last_name'] },
        { model: User, as: 'director',            attributes: ['first_name', 'last_name'] },
      ],
      order: [['generated_at', 'DESC']],
    });

    return res.json({ success: true, data: recs });
  } catch (error) {
    console.error('[directorController.listAllRecommendations]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve recommendations.' });
  }
};

module.exports = {
  listPendingHR,
  listPendingDirector,
  getRecommendation,
  endorseRecommendation,
  returnToManagerByHR,
  resubmitRecommendation,
  approveRecommendation,
  returnByDirector,
  listAllRecommendations,
};
