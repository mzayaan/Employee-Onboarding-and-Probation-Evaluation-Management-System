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
  RecommendationRevision,
  ProbationPeriod,
  EvaluationCheckpoint,
  ManagerEvaluation,
  EvaluationScore,
  EvaluationCriterion,
  EmployeeProfile,
  Department,
  User,
  sequelize,
} = require('../models');

const { calcContribution, deriveRecommendation } = require('../utils/scoringHelpers');

const { createAuditLog }    = require('../utils/auditLogger');
const { createNotification } = require('../services/notificationService');
// DPA-2017: same sensitive-field list used by employeeController for list/detail endpoints.
const { SENSITIVE_FIELDS }  = require('./employeeController');

// ---------------------------------------------------------------------------
// HELPER: strip SENSITIVE_FIELDS from the nested employeeProfile inside each
// recommendation row.  Used by any list endpoint exposed to roles that must not
// see payroll-sensitive employee data (LINE_MANAGER, DIRECTOR).
// Serialises Sequelize model instances to plain objects in the same pass.
// ---------------------------------------------------------------------------
const stripSensitiveFromRecs = (recs) =>
  recs.map((r) => {
    const rec     = r.toJSON ? r.toJSON() : r;
    const profile = rec?.probationPeriod?.employeeProfile;
    if (profile) SENSITIVE_FIELDS.forEach((f) => delete profile[f]);
    return rec;
  });

const getIp = (req) =>
  req.ip || req.socket?.remoteAddress || 'unknown'; // honours app trust proxy setting (G06)

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
          // G08: include COMPLETED checkpoints with their evaluation scores so the
          // manager correction form can render current scores by checkpoint.
          {
            model:    EvaluationCheckpoint,
            as:       'checkpoints',
            where:    { status: 'COMPLETED' },
            required: false,
            include: [{
              model:    ManagerEvaluation,
              as:       'managerEvaluation',
              required: false,
              include: [{
                model:    EvaluationScore,
                as:       'scores',
                required: false,
                include: [{
                  model:      EvaluationCriterion,
                  as:         'criterion',
                  attributes: ['criterion_id', 'name'],
                }],
              }],
            }],
          },
        ],
      },
      { model: User, as: 'submittedByManager', attributes: ['user_id', 'first_name', 'last_name', 'email'] },
      { model: User, as: 'endorsedByHR',       attributes: ['user_id', 'first_name', 'last_name'] },
      { model: User, as: 'director',            attributes: ['user_id', 'first_name', 'last_name'] },
      // G08: immutable revision history (INSERT-only audit trail)
      // separate:true runs a secondary SELECT so order:[['revised_at','ASC']] is
      // applied by that query's ORDER BY clause — Sequelize 6 nested-include order
      // is silently ignored without this flag.
      {
        model:    RecommendationRevision,
        as:       'revisions',
        required: false,
        separate: true,
        include: [{
          model:      User,
          as:         'actor',
          attributes: ['user_id', 'first_name', 'last_name'],
        }],
        order: [['revised_at', 'ASC']],
      },
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

    // DPA-2017: DIRECTOR must not see payroll-sensitive employee fields in list views.
    return res.json({ success: true, data: stripSensitiveFromRecs(recs) });
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

    // LINE_MANAGER may only view recommendations for employees they manage (NFR-03)
    if (req.user.role === 'LINE_MANAGER') {
      const managerUserId = rec.probationPeriod?.employeeProfile?.manager?.user_id;
      if (!managerUserId || managerUserId !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This recommendation does not belong to one of your employees.',
        });
      }
    }

    // NFR-03 / DPA-2017: LINE_MANAGER and DIRECTOR must not see payroll-sensitive
    // fields on the nested EmployeeProfile returned inside a recommendation response.
    // We serialise to plain JSON and strip the fields before sending.
    const recData = rec.toJSON ? rec.toJSON() : rec;
    const nestedProfile = recData?.probationPeriod?.employeeProfile;
    if (nestedProfile && (req.user.role === 'LINE_MANAGER' || req.user.role === 'DIRECTOR')) {
      SENSITIVE_FIELDS.forEach((f) => delete nestedProfile[f]);
    }

    // G08: for RETURNED_TO_MANAGER records, compute correction_eligible per score.
    // A score is eligible only if its checkpoint completed_at falls after the last
    // approved cycle boundary (same COALESCE ordering used by reviseAndResubmit).
    // Scores from checkpoints completed before the latest approved cycle are read-only
    // so the manager cannot retroactively revise already-incorporated evidence.
    if (rec.approval_status === 'RETURNED_TO_MANAGER') {
      const periodId = rec.probationPeriod?.period_id ?? recData.period_id;
      const lastApproved = periodId
        ? await FinalRecommendation.findOne({
            where:      { period_id: periodId, approval_status: 'APPROVED' },
            order:      [[sequelize.literal('COALESCE(director_decision_at, generated_at)'), 'DESC']],
            attributes: ['director_decision_at', 'generated_at'],
          })
        : null;
      const cycleDecisionAt = lastApproved?.director_decision_at
        ? new Date(lastApproved.director_decision_at)
        : lastApproved?.generated_at
          ? new Date(lastApproved.generated_at)
          : null;

      const checkpoints = recData.probationPeriod?.checkpoints ?? [];
      for (const cp of checkpoints) {
        const scores = cp.managerEvaluation?.scores ?? [];
        const cpDate = cp.completed_at ? new Date(cp.completed_at) : null;
        for (const score of scores) {
          score.correction_eligible = cycleDecisionAt === null || (cpDate !== null && cpDate > cycleDecisionAt);
        }
      }
    }

    return res.json({ success: true, data: recData });
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
  let t;
  try {
    const { recId } = req.params;
    const { hr_endorsement_notes = '', revision_count: clientRevisionCount } = req.body;

    // G08: atomic stale-revision check — fetch with row-level lock so no concurrent
    // revision can slip between the check and the status update.
    t = await sequelize.transaction();

    const rec = await FinalRecommendation.findByPk(recId, {
      lock:        t.LOCK.UPDATE,
      transaction: t,
    });
    if (!rec) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'PENDING_HR_REVIEW') {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Cannot endorse: recommendation is currently "${rec.approval_status}". Only PENDING_HR_REVIEW recommendations can be endorsed.`,
      });
    }

    // G08 stale revision protection: if the client passes revision_count, verify it
    // matches the DB value — a mismatch means the manager revised after HR loaded
    // this recommendation, and HR must reload before endorsing.
    if (clientRevisionCount !== undefined && clientRevisionCount !== null) {
      if (Number(rec.revision_count) !== Number(clientRevisionCount)) {
        await t.rollback();
        return res.status(409).json({
          success: false,
          message: 'Recommendation has been revised since you last loaded it. Please reload and review the updated submission before endorsing.',
        });
      }
    }

    await rec.update({
      approval_status:       'PENDING_DIRECTOR',
      endorsed_by:           req.user.user_id,
      endorsed_at:           new Date(),
      hr_endorsement_notes:  hr_endorsement_notes?.trim() || null,
      submitted_to_director_at: new Date(),
    }, { transaction: t });

    await t.commit();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_ENDORSED',
      description: `Recommendation ID ${recId} endorsed by HR (${req.user.first_name} ${req.user.last_name}) and forwarded to Director. Type: ${rec.recommendation_type}.`,
      ipAddress:   getIp(req),
    });

    // Notify Director
    void notifyDirectors(
      `A probation recommendation (${rec.recommendation_type}) has been endorsed by HR and requires your decision.`,
      recId
    );

    return res.json({
      success: true,
      message: 'Recommendation endorsed and forwarded to the Director for final approval.',
      data:    { rec_id: recId, approval_status: 'PENDING_DIRECTOR' },
    });
  } catch (error) {
    if (t) await t.rollback().catch(() => {});
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
  let t;
  try {
    const { recId } = req.params;
    const {
      justification                   = '',
      revision_count: clientRevCount  = undefined,  // G08 (Finding 1 — stale-review protection)
    } = req.body;

    // G08 (Finding 8 — payload validation): typeof guard matches reviseAndResubmit.
    // A non-string body field (number, null, object) passes !justification?.trim()
    // when coerced but must be rejected explicitly to prevent type-confusion bugs.
    if (!justification || typeof justification !== 'string' || !justification.trim()) {
      return res.status(400).json({ success: false, message: 'justification is required when resubmitting.' });
    }

    // G08: atomic ownership + status check — fetch with row-level lock so no concurrent
    // modification can slip between the check and the update.
    t = await sequelize.transaction();

    const rec = await FinalRecommendation.findByPk(recId, {
      lock:        t.LOCK.UPDATE,
      transaction: t,
      include:     [{ model: ProbationPeriod, as: 'probationPeriod' }],
    });
    if (!rec) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'RETURNED_TO_MANAGER') {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Cannot resubmit: recommendation status is "${rec.approval_status}". Only RETURNED_TO_MANAGER recommendations can be resubmitted.`,
      });
    }

    // G08 (Finding 1 — stale-review protection): reject if the client's optimistic-lock
    // counter no longer matches the DB value, indicating a concurrent revision.
    if (clientRevCount !== undefined && clientRevCount !== rec.revision_count) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: 'Conflict: recommendation was revised since you loaded the form. Reload and try again.',
      });
    }

    // G08: unified eligibility gate — mirrors reviseAndResubmitRecommendation.
    // A CANCELLED period can never produce a valid outcome; non-ACTIVE/EXTENDED
    // periods have already been closed, so a resubmission would be meaningless.
    const period = rec.probationPeriod;
    if (!period) {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Cannot resubmit: probation period record not found.' });
    }
    if (period.status === 'CANCELLED') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Cannot resubmit: probation period is cancelled.' });
    }
    if (!['ACTIVE', 'EXTENDED'].includes(period.status)) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Cannot resubmit: probation period status is "${period.status}". Only ACTIVE or EXTENDED periods are eligible.`,
      });
    }

    // G08 (Finding 4 — ownership consistency): verify via EmployeeProfile.manager_id,
    // not rec.submitted_by.  submitted_by captures who originally generated the
    // recommendation, but the manager may have been reassigned since then.  Only the
    // currently assigned manager should be able to resubmit.
    const empProfile = await EmployeeProfile.findOne({
      where:       { profile_id: period.profile_id },
      attributes:  ['manager_id'],
      transaction: t,
    });
    if (!empProfile || empProfile.manager_id !== req.user.user_id) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not the currently assigned manager for this employee.',
      });
    }

    // G08: unified history protection — write an immutable audit row inside the
    // same transaction before mutating the recommendation record, mirroring the
    // approach used by reviseAndResubmitRecommendation (Req 5).
    await RecommendationRevision.create({
      rec_id:                     rec.rec_id,
      actor_id:                   req.user.user_id,
      revised_at:                 new Date(),
      correction_reason:          justification.trim(),
      before_scores:              null,
      after_scores:               null,
      before_checkpoint_totals:   null,
      after_checkpoint_totals:    null,
      before_cumulative_score:    rec.cumulative_score != null ? parseFloat(rec.cumulative_score) : null,
      after_cumulative_score:     rec.cumulative_score != null ? parseFloat(rec.cumulative_score) : null,
      before_recommendation_type: rec.recommendation_type,
      after_recommendation_type:  rec.recommendation_type,
      before_justification:       rec.justification  || null,
      after_justification:        justification.trim(),
      hr_return_reason:           rec.hr_endorsement_notes || null,
      director_return_reason:     rec.director_reason      || null,
    }, { transaction: t });

    await rec.update({
      approval_status: 'PENDING_HR_REVIEW',
      justification:   justification.trim(),
      // G08: increment on every resubmit so endorsers and approvers can detect
      // that the recommendation was revised since they last loaded it.
      revision_count:  (rec.revision_count || 0) + 1,
      // Clear all stale decision fields so HR reviews fresh from the start (G08-Req6).
      // Both HR-returned and Director-returned paths must undergo a fresh HR review,
      // so Director decision fields are cleared here as well.
      endorsed_by:              null,
      endorsed_at:              null,
      hr_endorsement_notes:     null,
      submitted_to_director_at: null,
      director_id:              null,
      director_decision_at:     null,
      director_reason:          null,
    }, { transaction: t });

    await t.commit();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_RESUBMITTED',
      description: `Recommendation ID ${recId} resubmitted by manager with updated justification.`,
      ipAddress:   getIp(req),
    });

    void notifyHR(
      `A probation recommendation (${rec.recommendation_type}) has been resubmitted by a manager and requires your review.`,
      recId
    );

    return res.json({
      success: true,
      message: 'Recommendation resubmitted for HR review.',
      data:    { rec_id: recId, approval_status: 'PENDING_HR_REVIEW' },
    });
  } catch (error) {
    if (t) await t.rollback().catch(() => {});
    console.error('[directorController.resubmitRecommendation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to resubmit recommendation.' });
  }
};

// =============================================================================
// POST /api/director/:recId/revise-and-resubmit                          (G08)
// Line Manager makes controlled corrections to evaluation scores and
// resubmits a RETURNED_TO_MANAGER recommendation for fresh HR review.
//
// Transition: RETURNED_TO_MANAGER → PENDING_HR_REVIEW
//
// Req 1 (Eligibility):
//   • rec.approval_status === 'RETURNED_TO_MANAGER'
//   • period.status in ['ACTIVE', 'EXTENDED']
//   • requester is LINE_MANAGER and rec.submitted_by === req.user.user_id
//   • period not CANCELLED
//
// Req 2 (Protect Approved History):
//   • score_corrections may only target checkpoints in the CURRENT unapproved cycle
//     (completed_at strictly AFTER the last approved Director decision timestamp)
//
// Req 3 (Preserve Scoring Evidence):
//   • Uses frozen weight_percent_at_scoring; rejects unresolved-weight scores
//   • Applies G09 integer 1–5 validation on each corrected raw_score
//   • Keeps existing EvaluationScore.score_id / criterion_id
//
// Req 4 (Recalculate Consistently):
//   • Recalculates weighted_contribution per score using frozen weight
//   • Recalculates ManagerEvaluation.weighted_score for each affected checkpoint
//   • Recalculates FinalRecommendation.cumulative_score and recommendation_type
//     using the same formula as the original submission
//
// Req 5 (Revision History):
//   • Writes an immutable RecommendationRevision row inside the same transaction
//     (not a best-effort audit helper — a failed write aborts the entire operation)
//
// Req 6 (Restart Review):
//   • Clears ALL stale HR and Director decision fields (see resubmitRecommendation fix)
//   • Both HR-returned and Director-returned paths undergo fresh HR review
//
// Req 7 (Atomicity):
//   • Single Sequelize transaction covers score corrections, recalculation,
//     revision history write, and workflow status transition
//   • Row-level locks (LOCK.UPDATE) on FinalRecommendation and affected scores
//   • Notifications sent only after COMMIT
//
// Body: {
//   justification     (string, required) — updated submission justification
//   correction_reason (string, required) — explanation of why scores were changed
//   score_corrections (array, optional)  — [{ score_id, raw_score }, ...]
// }
//
// FR-15, FR-18 | G08 | NFR-02, NFR-03 | Objective 3
// =============================================================================
const reviseAndResubmitRecommendation = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { recId } = req.params;
    const {
      justification                   = '',
      correction_reason               = '',
      score_corrections               = [],
      revision_count: clientRevCount  = undefined,  // G08 (Finding 1 — stale-review protection)
    } = req.body;

    // ── Validate required text fields ────────────────────────────────────────
    // G08 (Finding 8 — payload validation): use explicit typeof check before
    // calling .trim() so that non-string values (number, object, null) cannot
    // reach the string method and throw a 500 instead of returning a clean 400.
    if (!justification || typeof justification !== 'string' || !justification.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'justification is required.' });
    }
    if (!correction_reason || typeof correction_reason !== 'string' || !correction_reason.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'correction_reason is required.' });
    }

    // ── 1. Lock-fetch FinalRecommendation ────────────────────────────────────
    const rec = await FinalRecommendation.findOne({
      where: { rec_id: recId },
      lock: t.LOCK.UPDATE,
      transaction: t,
      include: [{ model: ProbationPeriod, as: 'probationPeriod' }],
    });

    if (!rec) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    // ── 2. Status gate ────────────────────────────────────────────────────────
    if (rec.approval_status !== 'RETURNED_TO_MANAGER') {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Cannot revise: recommendation status is "${rec.approval_status}". Only RETURNED_TO_MANAGER recommendations can be revised and resubmitted.`,
      });
    }

    // ── 2b. Stale-review protection (G08 Finding 1) ───────────────────────────
    // When the client supplies revision_count, compare it against the DB value.
    // A mismatch means the manager loaded a stale form after the recommendation
    // was already revised by a concurrent submission.  Mirrors the identical
    // guards in endorseRecommendation and approveRecommendation.
    if (clientRevCount !== undefined && clientRevCount !== rec.revision_count) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: 'Conflict: recommendation was revised since you loaded the form. Reload and try again.',
      });
    }

    // ── 3. Ownership gate — current EmployeeProfile.manager_id (G08 Finding 4) ─
    // The read path (getRecommendation) already checks the CURRENT manager_id
    // from EmployeeProfile.  The write path previously checked only the
    // historical submitted_by field, which allows a former manager who is no
    // longer assigned to this employee to continue revising a recommendation
    // after a reassignment.  Aligning both paths to the current manager_id
    // closes the inconsistency.
    const period = rec.probationPeriod;

    const empProfile = await EmployeeProfile.findOne({
      where:       { profile_id: period.profile_id },
      attributes:  ['manager_id'],
      transaction: t,
    });
    if (!empProfile || empProfile.manager_id !== req.user.user_id) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        message: 'Access denied. You are not the currently assigned manager for this employee.',
      });
    }

    // ── 4. Period status gate ─────────────────────────────────────────────────
    if (period.status === 'CANCELLED') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Cannot revise: probation period is cancelled.' });
    }
    if (!['ACTIVE', 'EXTENDED'].includes(period.status)) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Cannot revise: probation period status is "${period.status}". Only ACTIVE or EXTENDED periods are eligible.`,
      });
    }

    // ── 5. Determine cycle boundary (last APPROVED Director decision) ─────────
    // G08 (Finding 3, Bug 2): fetch generated_at alongside director_decision_at
    // so it can serve as a fallback when director_decision_at is null.  An
    // APPROVED row can theoretically exist with a null director_decision_at if
    // it was inserted by a migration or a legacy code path that did not populate
    // the column; generated_at is always set by the model default.
    // G08 (Finding 3 — multi-cycle ordering): ORDER BY director_decision_at DESC
    // puts NULLs LAST in MySQL, so a newer APPROVED cycle whose director_decision_at
    // is NULL (e.g. inserted by a migration or legacy code path) is ranked below any
    // older cycle with an actual date.  COALESCE falls back to generated_at so the
    // most recently generated approved cycle is always returned first.
    const lastApproved = await FinalRecommendation.findOne({
      where: { period_id: period.period_id, approval_status: 'APPROVED' },
      order: [[sequelize.literal('COALESCE(director_decision_at, generated_at)'), 'DESC']],
      attributes: ['director_decision_at', 'generated_at'],
      transaction: t,
    });
    const cycleDecisionAt = lastApproved?.director_decision_at
      ? new Date(lastApproved.director_decision_at)
      : lastApproved?.generated_at
        ? new Date(lastApproved.generated_at)
        : null;

    // ── 6. Apply score corrections (if provided) ──────────────────────────────
    // G08: validate that score_corrections is an array before iterating.
    // A null, string or plain object body field would cause a silent no-op or
    // thrown TypeError without this guard.
    if (!Array.isArray(score_corrections)) {
      await t.rollback();
      return res.status(422).json({
        success: false,
        message: 'score_corrections must be an array.',
      });
    }

    const beforeScores             = [];
    const afterScores              = [];
    const beforeCheckpointTotals   = {};
    const afterCheckpointTotals    = {};
    const affectedCheckpointIds    = new Set();
    // Deduplication: only process each score_id once
    const processedScoreIds        = new Set();

    for (const corr of score_corrections) {
      // G08 (Finding 8 — payload validation): each element must be a plain object;
      // a null, primitive or nested array would throw on destructuring without this guard.
      if (corr === null || typeof corr !== 'object' || Array.isArray(corr)) {
        await t.rollback();
        return res.status(422).json({ success: false, message: 'Each element of score_corrections must be an object.' });
      }
      const { score_id, raw_score } = corr;

      // G08: validate score_id is a positive integer before the DB lookup.
      if (!Number.isInteger(score_id) || score_id < 1) {
        await t.rollback();
        return res.status(422).json({
          success: false,
          message: `Invalid score_id ${JSON.stringify(score_id)}. Must be a positive integer.`,
        });
      }

      // G09 — integer 1–5 validation
      if (!Number.isInteger(raw_score) || raw_score < 1 || raw_score > 5) {
        await t.rollback();
        return res.status(422).json({
          success: false,
          message: `Invalid raw_score ${raw_score} for score_id ${score_id}. Must be an integer between 1 and 5.`,
        });
      }

      if (processedScoreIds.has(score_id)) {
        await t.rollback();
        return res.status(422).json({ success: false, message: `Duplicate score_id ${score_id} in score_corrections.` });
      }
      processedScoreIds.add(score_id);

      // Load score with its evaluation and checkpoint for ownership + cycle checks
      const score = await EvaluationScore.findOne({
        where: { score_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [{
          model: ManagerEvaluation,
          as:    'managerEvaluation',
          include: [{
            model: EvaluationCheckpoint,
            as:    'checkpoint',
          }],
        }],
      });

      if (!score) {
        await t.rollback();
        return res.status(404).json({ success: false, message: `EvaluationScore ${score_id} not found.` });
      }

      const checkpoint = score.managerEvaluation?.checkpoint;

      // Ownership: checkpoint must belong to this period
      if (!checkpoint || checkpoint.period_id !== period.period_id) {
        await t.rollback();
        return res.status(403).json({
          success: false,
          message: `Score ${score_id} does not belong to period ${period.period_id}.`,
        });
      }

      // Cancelled checkpoint gate
      if (checkpoint.status === 'CANCELLED') {
        await t.rollback();
        return res.status(409).json({
          success: false,
          message: `Checkpoint ${checkpoint.checkpoint_id} is CANCELLED and cannot be corrected.`,
        });
      }

      // Approved-cycle protection (Req 2 / G08 Finding 3)
      if (cycleDecisionAt) {
        // G08 (Finding 3, Bug 1): when the cycle boundary is known but the
        // checkpoint has no completed_at, we cannot determine which cycle it
        // belongs to.  Reject the correction rather than silently accepting it.
        if (!checkpoint.completed_at) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            message: `Checkpoint ${checkpoint.checkpoint_id} has no completion timestamp; its cycle membership cannot be verified. Correction rejected.`,
          });
        }
        const cpCompletedAt = new Date(checkpoint.completed_at);
        if (cpCompletedAt <= cycleDecisionAt) {
          await t.rollback();
          return res.status(409).json({
            success: false,
            message: `Checkpoint ${checkpoint.checkpoint_id} belongs to an already-approved cycle and cannot be corrected.`,
          });
        }
      }

      // G09 — reject unresolved weight (Req 3)
      if (score.weight_percent_at_scoring == null) {
        await t.rollback();
        return res.status(422).json({
          success: false,
          message: `Score ${score_id} has an unresolved weight history. Corrections to pre-G09 scores are not permitted.`,
        });
      }

      // Capture before-state
      beforeScores.push({
        score_id:                   score.score_id,
        eval_id:                    score.eval_id,
        criterion_id:               score.criterion_id,
        raw_score:                  Number.parseFloat(score.raw_score),
        weight_percent_at_scoring:  Number.parseFloat(score.weight_percent_at_scoring),
        weighted_contribution:      score.weighted_contribution != null
          ? Number.parseFloat(score.weighted_contribution)
          : null,
      });

      // Calculate new contribution using frozen weight
      const newContribution = calcContribution(raw_score, score.weight_percent_at_scoring);

      // Apply correction
      await score.update({
        raw_score:              raw_score,
        weighted_contribution:  newContribution,
      }, { transaction: t });

      afterScores.push({
        score_id:                  score.score_id,
        eval_id:                   score.eval_id,
        criterion_id:              score.criterion_id,
        raw_score:                 raw_score,
        weight_percent_at_scoring: Number.parseFloat(score.weight_percent_at_scoring),
        weighted_contribution:     newContribution,
      });

      affectedCheckpointIds.add(checkpoint.checkpoint_id);
    }

    // ── 7. Recalculate ManagerEvaluation.weighted_score for affected checkpoints
    for (const cpId of affectedCheckpointIds) {
      const mgrEval = await ManagerEvaluation.findOne({
        where: { checkpoint_id: cpId },
        lock:  t.LOCK.UPDATE,
        transaction: t,
      });

      if (mgrEval) {
        beforeCheckpointTotals[cpId] = Number.parseFloat(mgrEval.weighted_score);

        // Sum all criterion contributions for this evaluation using frozen weights
        const allScores = await EvaluationScore.findAll({
          where: { eval_id: mgrEval.eval_id },
          transaction: t,
        });

        const newTotal = allScores.reduce((sum, s) => {
          // Prefer frozen weight; fall back to stored contribution for pre-G09 rows
          if (s.weight_percent_at_scoring != null) {
            return sum + calcContribution(Number.parseFloat(s.raw_score), s.weight_percent_at_scoring);
          }
          return sum + (s.weighted_contribution != null ? Number.parseFloat(s.weighted_contribution) : 0);
        }, 0);
        const newTotalRounded = Number.parseFloat(newTotal.toFixed(2));

        await mgrEval.update({ weighted_score: newTotalRounded }, { transaction: t });
        afterCheckpointTotals[cpId] = newTotalRounded;
      }
    }

    // ── 8. Recalculate cumulative score from current-cycle completed checkpoints
    // Consistent with original submitManagerEvaluation formula: average of all
    // completed checkpoints' weighted_score within the current unapproved cycle.
    const allCompletedCps = await EvaluationCheckpoint.findAll({
      where: { period_id: period.period_id, status: 'COMPLETED' },
      include: [{
        model:      ManagerEvaluation,
        as:         'managerEvaluation',
        attributes: ['weighted_score'],
      }],
      transaction: t,
    });

    // G08 (Finding 2 — scoring-policy consistency): the cumulative score is an
    // average of ALL completed checkpoints for the period, exactly as the original
    // submitManagerEvaluation formula computes it.  Filtering to only the current
    // cycle's checkpoints (those after cycleDecisionAt) would produce a different
    // result — a justification-only resubmission with no score changes would still
    // alter the cumulative score and recommendation type, which is incorrect.
    //
    // The cycle-boundary filter already serves its intended purpose: it restricts
    // which checkpoints can be EDITED (Approved-cycle protection, Req 2 above).
    // It must NOT also change the averaging denominator.
    const beforeCumulative = Number.parseFloat(rec.cumulative_score);
    const beforeRecType    = rec.recommendation_type;

    let newCumulative, newRecType;
    if (allCompletedCps.length > 0) {
      const scores   = allCompletedCps.map((cp) => Number.parseFloat(cp.managerEvaluation?.weighted_score || 0));
      newCumulative  = Number.parseFloat(
        (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
      );
      newRecType     = deriveRecommendation(newCumulative);
    } else {
      // No completed checkpoints found — retain existing values
      newCumulative = beforeCumulative;
      newRecType    = beforeRecType;
    }

    // ── 9. Write revision history (required — not best-effort) ───────────────
    await RecommendationRevision.create({
      rec_id:                     rec.rec_id,
      actor_id:                   req.user.user_id,
      revised_at:                 new Date(),
      correction_reason:          correction_reason.trim(),
      before_scores:              beforeScores.length    > 0 ? beforeScores              : null,
      after_scores:               afterScores.length     > 0 ? afterScores               : null,
      before_checkpoint_totals:   Object.keys(beforeCheckpointTotals).length > 0 ? beforeCheckpointTotals : null,
      after_checkpoint_totals:    Object.keys(afterCheckpointTotals).length  > 0 ? afterCheckpointTotals  : null,
      before_cumulative_score:    beforeCumulative,
      after_cumulative_score:     newCumulative,
      before_recommendation_type: beforeRecType,
      after_recommendation_type:  newRecType,
      before_justification:       rec.justification  || null,
      after_justification:        justification.trim(),
      hr_return_reason:           rec.hr_endorsement_notes || null,
      director_return_reason:     rec.director_reason      || null,
    }, { transaction: t });

    // ── 10. Update FinalRecommendation — restart review, clear all stale fields
    // G08: increment revision_count so endorseRecommendation / approveRecommendation
    // can detect staleness if the client passes a revision_count in the request body.
    await rec.update({
      approval_status:          'PENDING_HR_REVIEW',
      revision_count:           (rec.revision_count || 0) + 1,
      justification:             justification.trim(),
      cumulative_score:          newCumulative,
      recommendation_type:       newRecType,
      // HR decision fields
      endorsed_by:               null,
      endorsed_at:               null,
      hr_endorsement_notes:      null,
      submitted_to_director_at:  null,
      // Director decision fields
      director_id:               null,
      director_decision_at:      null,
      director_reason:           null,
    }, { transaction: t });

    // ── 11. Sync ProbationPeriod summary ──────────────────────────────────────
    await period.update({
      cumulative_score:     newCumulative,
      final_recommendation: newRecType,
      updated_at:           new Date(),
    }, { transaction: t });

    // ── 12. COMMIT ────────────────────────────────────────────────────────────
    await t.commit();

    // ── 13. Post-commit: audit log and notifications (fire-and-forget) ────────
    createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_REVISED_AND_RESUBMITTED',
      description: `Recommendation ID ${recId} revised and resubmitted. Cumulative: ${beforeCumulative}% → ${newCumulative}%. Type: ${beforeRecType} → ${newRecType}. ${score_corrections.length} score(s) corrected.`,
      ipAddress:   getIp(req),
    }).catch(() => {});

    void notifyHR(
      `A probation recommendation (${newRecType}) has been revised and resubmitted for your review.`,
      rec.rec_id
    );

    return res.json({
      success: true,
      message: 'Recommendation revised and resubmitted for HR review.',
      data: {
        rec_id:              rec.rec_id,
        approval_status:     'PENDING_HR_REVIEW',
        cumulative_score:    newCumulative,
        recommendation_type: newRecType,
        scores_corrected:    score_corrections.length,
      },
    });

  } catch (error) {
    await t.rollback();
    console.error('[directorController.reviseAndResubmitRecommendation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to revise and resubmit recommendation.' });
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
  let t;
  try {
    const { recId } = req.params;
    const { director_reason = '', revision_count: clientRevisionCount } = req.body;

    // G08: atomic stale-revision + status check — fetch with row-level lock inside a
    // single transaction so no concurrent revision or approval can slip between the
    // check and the update (replaces the previous outer-fetch + inner-transaction split).
    t = await sequelize.transaction();

    const rec = await FinalRecommendation.findByPk(recId, {
      include:     [{ model: ProbationPeriod, as: 'probationPeriod' }],
      lock:        t.LOCK.UPDATE,
      transaction: t,
    });
    if (!rec) {
      await t.rollback();
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    if (rec.approval_status !== 'PENDING_DIRECTOR') {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: `Cannot approve: recommendation is currently "${rec.approval_status}". Only PENDING_DIRECTOR recommendations can be approved.`,
      });
    }

    // G07: Prevent a pending Director approval from overwriting a CANCELLED probation
    // period.  This can happen when a no-probation contract is created for the employee
    // after the recommendation was raised but before the Director acts on it.
    if (rec.probationPeriod?.status === 'CANCELLED') {
      await t.rollback();
      return res.status(409).json({
        success: false,
        message: 'Cannot approve: the linked probation period has been cancelled.',
      });
    }

    // G08 stale revision protection: if the client passes revision_count, verify it
    // matches the DB value.  A mismatch means the manager revised after the Director
    // loaded this recommendation; the Director must reload before approving.
    if (clientRevisionCount !== undefined && clientRevisionCount !== null) {
      if (Number(rec.revision_count) !== Number(clientRevisionCount)) {
        await t.rollback();
        return res.status(409).json({
          success: false,
          message: 'Recommendation has been revised since you last loaded it. Please reload and review the updated submission before approving.',
        });
      }
    }

    // Derive the new ProbationPeriod status from recommendation_type
    const periodStatusMap = {
      CONFIRM: 'CONFIRMED',
      EXTEND:  'EXTENDED',
      DISMISS: 'DISMISSED',
    };
    const newPeriodStatus = periodStatusMap[rec.recommendation_type] || 'COMPLETED';

    await rec.update({
      approval_status:    'APPROVED',
      director_id:        req.user.user_id,
      director_decision_at: new Date(),
      director_reason:    director_reason?.trim() || null,
    }, { transaction: t });

    // Update ProbationPeriod to reflect the Director's decision
    if (rec.probationPeriod) {
      const periodUpdate = {
        status:     newPeriodStatus,
        updated_at: new Date(),
      };

      // FR-15 / EXTEND: push the end_date forward by the extension length and
      // create a follow-up evaluation checkpoint so the system can track the
      // extended period without requiring manual configuration.
      if (rec.recommendation_type === 'EXTEND' && rec.probationPeriod.end_date) {
        const extensionDays = 90; // default extension period — configurable in future
        const currentEnd    = new Date(rec.probationPeriod.end_date);
        const newEnd        = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + extensionDays);
        periodUpdate.end_date = newEnd.toISOString().slice(0, 10);

        // Determine the highest existing day_number so the new checkpoint
        // sits after the last one (avoids the unique(period_id, day_number) constraint)
        const lastCheckpoint = await EvaluationCheckpoint.findOne({
          where:  { period_id: rec.probationPeriod.period_id },
          order:  [['day_number', 'DESC']],
          transaction: t,
        });
        const nextDayNumber = (lastCheckpoint?.day_number ?? 0) + extensionDays;

        // Create a follow-up checkpoint at the new end date
        await EvaluationCheckpoint.create({
          period_id:        rec.probationPeriod.period_id,
          checkpoint_label: 'Extension Review',
          day_number:       nextDayNumber,
          due_date:         newEnd.toISOString().slice(0, 10),
          status:           'PENDING',
        }, { transaction: t });
      }

      await rec.probationPeriod.update(periodUpdate, { transaction: t });

      // G02-FIX: Sync EmployeeProfile with the Director decision.
      //   employment_status: CONFIRM → PERMANENT, EXTEND → EXTENDED, DISMISS → DISMISSED
      //   probation_end_date: synced to the new period end_date on EXTEND so that
      //     HR and employee profile screens always display the current end date.
      const employmentStatusMap = {
        CONFIRM: 'PERMANENT',
        EXTEND:  'EXTENDED',
        DISMISS: 'DISMISSED',
      };
      const newEmploymentStatus = employmentStatusMap[rec.recommendation_type];
      if (newEmploymentStatus) {
        const profileUpdate = { employment_status: newEmploymentStatus };
        // periodUpdate.end_date is only set when recommendation_type === 'EXTEND'
        if (periodUpdate.end_date) {
          profileUpdate.probation_end_date = periodUpdate.end_date;
        }
        await EmployeeProfile.update(
          profileUpdate,
          { where: { profile_id: rec.probationPeriod.profile_id }, transaction: t }
        );
      }
    }

    await t.commit();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'RECOMMENDATION_APPROVED',
      description: `Director ${req.user.first_name} ${req.user.last_name} approved recommendation ID ${recId} (${rec.recommendation_type}). Probation period updated to ${newPeriodStatus}. PDF report unlocked.`,
      ipAddress:   getIp(req),
    });

    // Notify HR and the originating manager
    const approvalMsg = `The probation recommendation (${rec.recommendation_type}) has been approved by the Director. The PDF report is now available.`;
    void notifyHR(approvalMsg, recId);
    if (rec.submitted_by) {
      createNotification({
        userId:            rec.submitted_by,
        type:              'RECOMMENDATION_APPROVED',
        message:           approvalMsg,
        relatedEntityType: 'recommendation',
        relatedEntityId:   recId,
      }).catch(() => {});
    }

    // G4-FIX FR-15: Notify the employee about their probation outcome.
    if (rec.probationPeriod?.profile_id) {
      const outcomeMessages = {
        CONFIRM: 'Congratulations! Your probation period has been successfully completed. Your employment has been confirmed.',
        EXTEND:  'Your probation evaluation has been reviewed. Your probation period has been extended. Please log in for more details.',
        DISMISS: 'Your probation evaluation has been reviewed. A formal notification from HR will follow. Please contact HR for further information.',
      };
      EmployeeProfile.findByPk(rec.probationPeriod.profile_id, { attributes: ['user_id'] })
        .then((ep) => {
          if (!ep) return;
          createNotification({
            userId:            ep.user_id,
            type:              'PROBATION_OUTCOME',
            message:           outcomeMessages[rec.recommendation_type] || 'Your probation evaluation outcome has been finalised. Please log in for details.',
            relatedEntityType: 'recommendation',
            relatedEntityId:   recId,
          }).catch(() => {});
        })
        .catch(() => {});
    }

    return res.json({
      success: true,
      message: `Recommendation approved. Probation period is now "${newPeriodStatus}". PDF report is now available for download.`,
      data:    { rec_id: recId, approval_status: 'APPROVED', period_status: newPeriodStatus },
    });
  } catch (error) {
    if (t) await t.rollback().catch(() => {});
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
    void notifyHR(returnMsg, recId);
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

    // DPA-2017: DIRECTOR must not see payroll-sensitive fields; HR_ADMIN may see all.
    const data = req.user.role === 'DIRECTOR'
      ? stripSensitiveFromRecs(recs)
      : recs.map((r) => (r.toJSON ? r.toJSON() : r));
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[directorController.listAllRecommendations]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve recommendations.' });
  }
};

// =============================================================================
// GET /api/director/:recId/revision-history
// LINE_MANAGER (or HR_ADMIN/DIRECTOR) views immutable revision records for a
// returned probation recommendation.
// G08 (Finding 7 — interface completeness): exposes the RecommendationRevision
// audit trail that the controller already writes on every revise-and-resubmit.
// FR-18 | G08 | NFR-02, NFR-03, NFR-08 | Objective 3
// =============================================================================
const getRevisionHistory = async (req, res) => {
  try {
    const { recId } = req.params;
    const rec = await FinalRecommendation.findByPk(recId, {
      attributes: ['rec_id', 'submitted_by', 'approval_status'],
      include: [{ model: ProbationPeriod, as: 'probationPeriod', attributes: ['profile_id'] }],
    });
    if (!rec) {
      return res.status(404).json({ success: false, message: 'Recommendation not found.' });
    }

    // LINE_MANAGER may only view history for a recommendation that belongs to an
    // employee they CURRENTLY manage.  Using submitted_by here would let a former
    // manager (reassigned off the employee) read revision history after handover —
    // the same restriction applied to the write endpoint.
    if (req.user.role === 'LINE_MANAGER') {
      const profile = await EmployeeProfile.findOne({ where: { profile_id: rec.probationPeriod?.profile_id } });
      if (!profile || profile.manager_id !== req.user.user_id) {
        return res.status(403).json({ success: false, message: 'You do not have access to this recommendation.' });
      }
    }

    const revisions = await RecommendationRevision.findAll({
      where:   { rec_id: recId },
      order:   [['revised_at', 'ASC']],
      include: [{ model: User, as: 'actor', attributes: ['first_name', 'last_name'] }],
    });

    return res.json({ success: true, data: revisions });
  } catch (error) {
    console.error('[directorController.getRevisionHistory]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve revision history.' });
  }
};

// =============================================================================
// GET /api/director/my-recommendations
// LINE_MANAGER views all recommendations they have submitted OR for employees
// they currently manage (manager_id match on EmployeeProfile).
// G08 (Finding 7 — interface completeness): the original query used only
// submitted_by, so a manager who took over an employee mid-probation would not
// see recommendations submitted by the previous manager.  The fix adds an OR
// clause covering EmployeeProfile.manager_id.
// FR-15 | NFR-03 | Objective 3
// =============================================================================
const listMyRecommendations = async (req, res) => {
  try {
    const { user_id } = req.user;

    // Find profile_ids for employees this manager currently owns.
    const managedProfiles = await EmployeeProfile.findAll({
      where:      { manager_id: user_id },
      attributes: ['profile_id'],
    });
    const managedProfileIds = managedProfiles.map((p) => p.profile_id);

    // Collect period_ids for those profiles so we can join via probationPeriod.
    const managedPeriods = managedProfileIds.length
      ? await ProbationPeriod.findAll({
          where:      { profile_id: managedProfileIds },
          attributes: ['period_id'],
        })
      : [];
    const managedPeriodIds = managedPeriods.map((p) => p.period_id);

    const { Op } = require('sequelize');
    const recs = await FinalRecommendation.findAll({
      where: {
        [Op.or]: [
          { submitted_by: user_id },
          ...(managedPeriodIds.length ? [{ period_id: managedPeriodIds }] : []),
        ],
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
        { model: User, as: 'endorsedByHR', attributes: ['first_name', 'last_name'] },
        { model: User, as: 'director',     attributes: ['first_name', 'last_name'] },
      ],
      order: [['generated_at', 'DESC']],
    });

    // DPA-2017: LINE_MANAGER must not see payroll-sensitive employee fields.
    return res.json({ success: true, data: stripSensitiveFromRecs(recs) });
  } catch (error) {
    console.error('[directorController.listMyRecommendations]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve your recommendations.' });
  }
};

module.exports = {
  listPendingHR,
  listPendingDirector,
  getRecommendation,
  endorseRecommendation,
  returnToManagerByHR,
  resubmitRecommendation,
  reviseAndResubmitRecommendation, // G08
  getRevisionHistory,              // G08 (Finding 7 — interface completeness)
  approveRecommendation,
  returnByDirector,
  listAllRecommendations,
  listMyRecommendations,
  stripSensitiveFromRecs, // exported for unit testing (DPA-2017)
};
