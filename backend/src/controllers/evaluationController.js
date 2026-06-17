// =============================================================================
// src/controllers/evaluationController.js
// Probation evaluation workflow:
//   - Probation period + checkpoint management
//   - Manager evaluation submission with weighted scoring
//   - Employee self-assessment submission
//   - Automatic final recommendation generation
// FR-10, FR-11, FR-12, FR-13, FR-14, FR-15 | NFR-02, NFR-03 | Objectives 2, 3
// =============================================================================

const { createAuditLog } = require('../utils/auditLogger');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Calculate weighted contribution for a single score.
 * Formula: (raw_score / 5.0) * weight_percent
 */
const calcContribution = (rawScore, weightPercent) =>
  parseFloat(((rawScore / 5.0) * parseFloat(weightPercent)).toFixed(2));

/**
 * Determine recommendation from cumulative score.
 * >= 75 → CONFIRM | 50–74.99 → EXTEND | < 50 → DISMISS
 */
const deriveRecommendation = (score) => {
  if (score >= 75) return 'CONFIRM';
  if (score >= 50) return 'EXTEND';
  return 'DISMISS';
};

// =============================================================================
// GET /api/evaluations/probation/:profileId
// HR Admin or Line Manager views an employee's probation period + checkpoints.
// FR-11 | NFR-03
// =============================================================================
const getProbationByProfile = async (req, res) => {
  try {
    const {
      ProbationPeriod,
      EvaluationCheckpoint,
      ManagerEvaluation,
      SelfAssessment,
      EmployeeProfile,
      User,
    } = require('../models');

    const { profileId } = req.params;

    // Managers may only access employees they manage
    if (req.user.role === 'LINE_MANAGER') {
      const profile = await EmployeeProfile.findByPk(profileId, {
        attributes: ['manager_id'],
      });
      if (!profile || profile.manager_id !== req.user.user_id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    const period = await ProbationPeriod.findOne({
      where: { profile_id: profileId },
      include: [
        {
          model: EvaluationCheckpoint,
          as:    'checkpoints',
          include: [
            { model: ManagerEvaluation, as: 'managerEvaluation', attributes: ['eval_id', 'weighted_score', 'submitted_at'] },
            { model: SelfAssessment,    as: 'selfAssessment',    attributes: ['assessment_id', 'self_score', 'submitted_at'] },
          ],
          order: [['day_number', 'ASC']],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    if (!period) {
      return res.status(404).json({ success: false, message: 'No probation period found for this employee.' });
    }

    return res.json({ success: true, data: period });
  } catch (error) {
    console.error('[evaluationController.getProbationByProfile]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve probation period.' });
  }
};

// =============================================================================
// GET /api/evaluations/my-probation
// Employee views their own probation period + checkpoints.
// FR-11 | NFR-03
// =============================================================================
const getMyProbation = async (req, res) => {
  try {
    const {
      ProbationPeriod,
      EvaluationCheckpoint,
      ManagerEvaluation,
      SelfAssessment,
      EmployeeProfile,
    } = require('../models');

    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
    });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const period = await ProbationPeriod.findOne({
      where: { profile_id: profile.profile_id },
      include: [
        {
          model: EvaluationCheckpoint,
          as:    'checkpoints',
          include: [
            { model: ManagerEvaluation, as: 'managerEvaluation', attributes: ['eval_id', 'weighted_score', 'submitted_at'] },
            { model: SelfAssessment,    as: 'selfAssessment',    attributes: ['assessment_id', 'self_score', 'submitted_at'] },
          ],
          order: [['day_number', 'ASC']],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    if (!period) {
      return res.status(404).json({ success: false, message: 'No active probation period found.' });
    }

    return res.json({ success: true, data: period });
  } catch (error) {
    console.error('[evaluationController.getMyProbation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve probation data.' });
  }
};

// =============================================================================
// GET /api/evaluations/checkpoint/:checkpointId
// Returns checkpoint + criteria + any existing manager evaluation and self-assessment.
// Accessible by HR Admin, Line Manager (own team), or Employee (own).
// FR-11, FR-13, FR-14
// =============================================================================
const getCheckpoint = async (req, res) => {
  try {
    const {
      EvaluationCheckpoint,
      ProbationPeriod,
      EmployeeProfile,
      ManagerEvaluation,
      EvaluationScore,
      SelfAssessment,
      SelfAssessmentScore,
      EvaluationCriterion,
      User,
    } = require('../models');

    const { checkpointId } = req.params;

    const checkpoint = await EvaluationCheckpoint.findByPk(checkpointId, {
      include: [
        {
          model: ProbationPeriod,
          as:    'probationPeriod',
          include: [
            {
              model: EmployeeProfile,
              as:    'employeeProfile',
              include: [
                { model: User, as: 'user',    attributes: ['user_id', 'first_name', 'last_name', 'email'] },
                { model: User, as: 'manager', attributes: ['user_id', 'first_name', 'last_name'] },
              ],
            },
            {
              // Sibling checkpoints — used for the history panel in the evaluation form
              model: EvaluationCheckpoint,
              as:    'checkpoints',
              include: [
                { model: ManagerEvaluation, as: 'managerEvaluation', attributes: ['eval_id', 'weighted_score', 'submitted_at'] },
                { model: SelfAssessment,    as: 'selfAssessment',    attributes: ['assessment_id', 'self_score', 'submitted_at'] },
              ],
              order: [['day_number', 'ASC']],
            },
          ],
        },
        {
          model: ManagerEvaluation,
          as:    'managerEvaluation',
          include: [
            {
              model: EvaluationScore,
              as:    'scores',
              include: [
                { model: EvaluationCriterion, as: 'criterion', attributes: ['criterion_id', 'name', 'description', 'weight_percent'] },
              ],
            },
          ],
        },
        {
          model: SelfAssessment,
          as:    'selfAssessment',
          include: [
            {
              model: SelfAssessmentScore,
              as:    'scores',
              include: [
                { model: EvaluationCriterion, as: 'criterion', attributes: ['criterion_id', 'name', 'description', 'weight_percent'] },
              ],
            },
          ],
        },
      ],
    });

    if (!checkpoint) {
      return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    }

    // Access control
    const profile = checkpoint.probationPeriod?.employeeProfile;
    if (req.user.role === 'LINE_MANAGER' && profile?.manager_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (req.user.role === 'NEW_EMPLOYEE' && profile?.user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Also return all active criteria so the form can render even before submission
    const criteria = await EvaluationCriterion.findAll({
      where:  { is_active: true },
      order:  [['display_order', 'ASC'], ['criterion_id', 'ASC']],
    });

    // ── Attendance summary for this checkpoint's date window (FR-12) ──────────
    let attendanceSummary = null;
    try {
      const { AttendanceRecord } = require('../models');
      const { Op }               = require('sequelize');

      const periodId = checkpoint.probationPeriod?.period_id;
      if (periodId) {
        // Sort sibling checkpoints by day_number to find the previous one
        const siblings = (checkpoint.probationPeriod?.checkpoints || [])
          .slice()
          .sort((a, b) => a.day_number - b.day_number);

        const currentIdx = siblings.findIndex(
          (s) => s.checkpoint_id === parseInt(checkpointId, 10)
        );

        const fromDate =
          currentIdx > 0
            ? siblings[currentIdx - 1].due_date           // previous checkpoint end
            : checkpoint.probationPeriod.start_date;       // beginning of probation

        const toDate = checkpoint.due_date;

        const records = await AttendanceRecord.findAll({
          where: {
            period_id:   periodId,
            record_date: { [Op.between]: [fromDate, toDate] },
          },
          attributes: ['status'],
        });

        attendanceSummary = {
          total_records: records.length,
          days_present:  records.filter((r) => r.status === 'PRESENT').length,
          days_absent:   records.filter((r) => r.status === 'ABSENT').length,
          late_arrivals: records.filter((r) => r.status === 'LATE').length,
          half_days:     records.filter((r) => r.status === 'HALF_DAY').length,
          from_date:     fromDate,
          to_date:       toDate,
        };
      }
    } catch (e) {
      // Non-fatal — evaluation form can still be submitted with manually entered values
      console.warn('[getCheckpoint] Could not compute attendance summary:', e.message);
    }

    return res.json({ success: true, data: checkpoint, criteria, attendanceSummary });
  } catch (error) {
    console.error('[evaluationController.getCheckpoint]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve checkpoint.' });
  }
};

// =============================================================================
// GET /api/evaluations/manager/my-team
// Line Manager views their team's probation overview.
// FR-11, FR-14 | NFR-03
// =============================================================================
const getMyTeam = async (req, res) => {
  try {
    const {
      EmployeeProfile,
      ProbationPeriod,
      EvaluationCheckpoint,
      ManagerEvaluation,
      User,
    } = require('../models');

    const profiles = await EmployeeProfile.findAll({
      where: { manager_id: req.user.user_id },
      include: [
        {
          model:      User,
          as:         'user',
          attributes: ['user_id', 'first_name', 'last_name', 'email'],
        },
        {
          model: ProbationPeriod,
          as:    'probationPeriods',
          where: { status: 'ACTIVE' },
          required: false,
          include: [
            {
              model: EvaluationCheckpoint,
              as:    'checkpoints',
              // NOTE: order inside nested include is not supported in Sequelize v6
              // without separate:true — sort in JS instead (see below).
              include: [
                { model: ManagerEvaluation, as: 'managerEvaluation', attributes: ['eval_id', 'weighted_score', 'submitted_at'] },
              ],
            },
          ],
        },
      ],
    });

    // Sort checkpoints by day_number ASC in JavaScript (Sequelize v6 does not
    // support order inside a nested include without separate:true).
    profiles.forEach((profile) => {
      (profile.probationPeriods || []).forEach((period) => {
        if (Array.isArray(period.checkpoints)) {
          period.checkpoints.sort((a, b) => a.day_number - b.day_number);
        }
      });
    });

    return res.json({ success: true, data: profiles });
  } catch (error) {
    console.error('[evaluationController.getMyTeam]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve team data.' });
  }
};

// =============================================================================
// POST /api/evaluations/checkpoint/:checkpointId/manager
// Line Manager (or HR Admin) submits a manager evaluation.
// Body: { scores: [{criterion_id, raw_score}], performance_notes, attendance_days_present, attendance_days_absent, late_arrivals }
// FR-11, FR-12, FR-14, FR-15 | NFR-02
// =============================================================================
const submitManagerEvaluation = async (req, res) => {
  try {
    const {
      EvaluationCheckpoint,
      ProbationPeriod,
      EmployeeProfile,
      EvaluationCriterion,
      ManagerEvaluation,
      EvaluationScore,
      PerformanceNote,
      FinalRecommendation,
      SelfAssessment,
    } = require('../models');
    const sequelize = require('../config/database');

    const { checkpointId } = req.params;
    const {
      scores               = [],
      performance_notes    = '',
      attendance_days_present = 0,
      attendance_days_absent  = 0,
      late_arrivals           = 0,
    } = req.body;

    if (!scores.length) {
      return res.status(400).json({ success: false, message: 'At least one score is required.' });
    }

    // Load checkpoint and verify access
    const checkpoint = await EvaluationCheckpoint.findByPk(checkpointId, {
      include: [
        {
          model: ProbationPeriod,
          as:    'probationPeriod',
          include: [
            {
              model: EmployeeProfile,
              as:    'employeeProfile',
              attributes: ['profile_id', 'manager_id'],
            },
          ],
        },
      ],
    });
    if (!checkpoint) {
      return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    }
    // Guard against duplicate manager evaluation.
    // Do NOT use checkpoint.status here — a checkpoint is only COMPLETED when BOTH
    // manager evaluation AND employee self-assessment are submitted (FR-11, FR-13).
    const existingManagerEval = await ManagerEvaluation.findOne({ where: { checkpoint_id: checkpointId } });
    if (existingManagerEval) {
      return res.status(409).json({ success: false, message: 'Manager evaluation already submitted for this checkpoint.' });
    }

    const profile = checkpoint.probationPeriod?.employeeProfile;
    if (req.user.role === 'LINE_MANAGER' && profile?.manager_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Load active criteria to validate and compute weights
    const criteriaMap = {};
    const allCriteria = await EvaluationCriterion.findAll({ where: { is_active: true } });
    for (const c of allCriteria) {
      criteriaMap[c.criterion_id] = c;
    }

    // FR-10: Active criteria weights must sum to exactly 100% before any
    // evaluation can be submitted — otherwise scores are not comparable.
    const totalCriteriaWeight = allCriteria.reduce(
      (sum, c) => sum + parseFloat(c.weight_percent), 0
    );
    if (Math.abs(totalCriteriaWeight - 100) > 0.01) {
      return res.status(422).json({
        success: false,
        message: `Evaluation criteria weights must total 100%. Current total: ${totalCriteriaWeight.toFixed(2)}%. Please ask the System Administrator to update the criteria configuration.`,
      });
    }

    // Validate all submitted scores reference active criteria
    for (const s of scores) {
      if (!criteriaMap[s.criterion_id]) {
        return res.status(400).json({ success: false, message: `Invalid criterion_id: ${s.criterion_id}` });
      }
      if (s.raw_score < 1 || s.raw_score > 5) {
        return res.status(400).json({ success: false, message: 'Each score must be between 1 and 5.' });
      }
    }

    // Calculate per-criterion contributions and total weighted score
    let totalWeighted = 0;
    const scoreRows = scores.map((s) => {
      const contribution = calcContribution(s.raw_score, criteriaMap[s.criterion_id].weight_percent);
      totalWeighted += contribution;
      return {
        criterion_id:          s.criterion_id,
        raw_score:             s.raw_score,
        weighted_contribution: contribution,
      };
    });
    totalWeighted = parseFloat(totalWeighted.toFixed(2));

    // Persist in a transaction
    await sequelize.transaction(async (t) => {
      // Create manager evaluation record
      const evaluation = await ManagerEvaluation.create({
        checkpoint_id:          checkpointId,
        evaluated_by:           req.user.user_id,
        attendance_days_present: Number(attendance_days_present),
        attendance_days_absent:  Number(attendance_days_absent),
        late_arrivals:           Number(late_arrivals),
        weighted_score:          totalWeighted,
        submitted_at:            new Date(),
      }, { transaction: t });

      // Create individual score rows
      await EvaluationScore.bulkCreate(
        scoreRows.map((r) => ({ ...r, eval_id: evaluation.eval_id })),
        { transaction: t }
      );

      // Save performance notes if provided
      if (performance_notes?.trim()) {
        await PerformanceNote.create({
          profile_id:          profile.profile_id,
          evaluation_period_id: checkpointId,   // FK to evaluation_checkpoints
          recorded_by:         req.user.user_id,
          note_text:           performance_notes.trim(),
          created_at:          new Date(),
        }, { transaction: t });
      }

      // FR-11 + FR-13: A checkpoint is only COMPLETED when BOTH the manager evaluation
      // and the employee self-assessment have been submitted. Check here; the same
      // logic runs in submitSelfAssessment for the reverse order.
      const selfAssessmentDone = await SelfAssessment.findOne({
        where: { checkpoint_id: checkpointId },
        transaction: t,
      });

      if (selfAssessmentDone) {
        await checkpoint.update({
          status:       'COMPLETED',
          completed_at: new Date(),
        }, { transaction: t });

        // Check if ALL checkpoints for this probation period are now completed.
        // If so, generate the final recommendation automatically.
        const period = checkpoint.probationPeriod;
        const allCheckpoints = await EvaluationCheckpoint.findAll({
          where: { period_id: period.period_id },
          include: [{ model: ManagerEvaluation, as: 'managerEvaluation', attributes: ['weighted_score'] }],
          transaction: t,
        });

        const pendingCount = allCheckpoints.filter((c) => c.status !== 'COMPLETED').length;

        if (pendingCount === 0) {
          // All checkpoints done — calculate cumulative average of manager weighted scores
          const evalScores = allCheckpoints
            .map((c) => parseFloat(c.managerEvaluation?.weighted_score || 0));
          const cumulative = parseFloat(
            (evalScores.reduce((a, b) => a + b, 0) / (evalScores.length || 1)).toFixed(2)
          );
          const recommendationType = deriveRecommendation(cumulative);

          // Upsert final recommendation
          await FinalRecommendation.findOrCreate({
            where: { period_id: period.period_id },
            defaults: {
              recommendation_type: recommendationType,
              cumulative_score:    cumulative,
              generated_at:        new Date(),
              generated_by:        req.user.user_id,
            },
            transaction: t,
          });

          // Update probation period cumulative score + status
          const newStatus = recommendationType === 'EXTEND' ? 'EXTENDED' : 'COMPLETED';
          await period.update({
            cumulative_score:     cumulative,
            final_recommendation: recommendationType,
            status:               newStatus,
            updated_at:           new Date(),
          }, { transaction: t });

          await createAuditLog({
            userId:      req.user.user_id,
            actionType:  'RECOMMENDATION_GENERATED',
            description: `Final recommendation ${recommendationType} generated for profile_id ${profile.profile_id}. Cumulative score: ${cumulative}%.`,
            ipAddress:   getIp(req),
          });
        }
      }

      await createAuditLog({
        userId:      req.user.user_id,
        actionType:  'EVALUATION_SUBMITTED',
        description: `Manager evaluation submitted for checkpoint_id ${checkpointId} (${checkpoint.checkpoint_label}). Weighted score: ${totalWeighted}%.`,
        ipAddress:   getIp(req),
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Evaluation submitted successfully.',
      data:    { checkpoint_id: checkpointId, weighted_score: totalWeighted },
    });
  } catch (error) {
    console.error('[evaluationController.submitManagerEvaluation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit evaluation.' });
  }
};

// =============================================================================
// POST /api/evaluations/checkpoint/:checkpointId/self
// Employee submits their own self-assessment.
// Body: { scores: [{criterion_id, raw_score}], self_reflection_notes }
// FR-13, FR-14 | NFR-03
// =============================================================================
const submitSelfAssessment = async (req, res) => {
  try {
    const {
      EvaluationCheckpoint,
      ProbationPeriod,
      EmployeeProfile,
      EvaluationCriterion,
      ManagerEvaluation,
      SelfAssessment,
      SelfAssessmentScore,
      FinalRecommendation,
    } = require('../models');
    const sequelize = require('../config/database');

    const { checkpointId } = req.params;
    const { scores = [], self_reflection_notes = '' } = req.body;

    if (!scores.length) {
      return res.status(400).json({ success: false, message: 'At least one score is required.' });
    }

    // Load checkpoint and verify this employee owns it
    const checkpoint = await EvaluationCheckpoint.findByPk(checkpointId, {
      include: [
        {
          model: ProbationPeriod,
          as:    'probationPeriod',
          include: [
            { model: EmployeeProfile, as: 'employeeProfile', attributes: ['profile_id', 'user_id'] },
          ],
        },
      ],
    });
    if (!checkpoint) {
      return res.status(404).json({ success: false, message: 'Checkpoint not found.' });
    }

    const profile = checkpoint.probationPeriod?.employeeProfile;
    if (!profile || profile.user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Check no duplicate self-assessment
    const existing = await SelfAssessment.findOne({ where: { checkpoint_id: checkpointId } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Self-assessment already submitted for this checkpoint.' });
    }

    // Load active criteria
    const criteriaMap = {};
    const allCriteria = await EvaluationCriterion.findAll({ where: { is_active: true } });
    for (const c of allCriteria) {
      criteriaMap[c.criterion_id] = c;
    }

    // Validate scores
    for (const s of scores) {
      if (!criteriaMap[s.criterion_id]) {
        return res.status(400).json({ success: false, message: `Invalid criterion_id: ${s.criterion_id}` });
      }
      if (s.raw_score < 1 || s.raw_score > 5) {
        return res.status(400).json({ success: false, message: 'Each score must be between 1 and 5.' });
      }
    }

    // Calculate weighted self-score
    let totalSelfScore = 0;
    const scoreRows = scores.map((s) => {
      const contribution = calcContribution(s.raw_score, criteriaMap[s.criterion_id].weight_percent);
      totalSelfScore += contribution;
      return { criterion_id: s.criterion_id, raw_score: s.raw_score, weighted_contribution: contribution };
    });
    totalSelfScore = parseFloat(totalSelfScore.toFixed(2));

    await sequelize.transaction(async (t) => {
      const assessment = await SelfAssessment.create({
        checkpoint_id:          checkpointId,
        employee_profile_id:    profile.profile_id,
        self_reflection_notes:  self_reflection_notes?.trim() || null,
        self_score:             totalSelfScore,
        submitted_at:           new Date(),
      }, { transaction: t });

      await SelfAssessmentScore.bulkCreate(
        scoreRows.map((r) => ({ ...r, assessment_id: assessment.assessment_id })),
        { transaction: t }
      );

      // FR-11 + FR-13: Mark checkpoint COMPLETED only when BOTH the manager evaluation
      // and the employee self-assessment have been submitted.
      const managerDone = await ManagerEvaluation.findOne({
        where: { checkpoint_id: checkpointId },
        transaction: t,
      });

      if (managerDone) {
        await checkpoint.update({
          status:       'COMPLETED',
          completed_at: new Date(),
        }, { transaction: t });

        // Check if ALL checkpoints for this probation period are now completed.
        const period = checkpoint.probationPeriod;
        const allCheckpoints = await EvaluationCheckpoint.findAll({
          where: { period_id: period.period_id },
          include: [{ model: ManagerEvaluation, as: 'managerEvaluation', attributes: ['weighted_score'] }],
          transaction: t,
        });

        const pendingCount = allCheckpoints.filter((c) => c.status !== 'COMPLETED').length;

        if (pendingCount === 0) {
          const evalScores = allCheckpoints
            .map((c) => parseFloat(c.managerEvaluation?.weighted_score || 0));
          const cumulative = parseFloat(
            (evalScores.reduce((a, b) => a + b, 0) / (evalScores.length || 1)).toFixed(2)
          );
          const recommendationType = deriveRecommendation(cumulative);

          await FinalRecommendation.findOrCreate({
            where: { period_id: period.period_id },
            defaults: {
              recommendation_type: recommendationType,
              cumulative_score:    cumulative,
              generated_at:        new Date(),
              generated_by:        req.user.user_id,
            },
            transaction: t,
          });

          const newStatus = recommendationType === 'EXTEND' ? 'EXTENDED' : 'COMPLETED';
          await period.update({
            cumulative_score:     cumulative,
            final_recommendation: recommendationType,
            status:               newStatus,
            updated_at:           new Date(),
          }, { transaction: t });

          await createAuditLog({
            userId:      req.user.user_id,
            actionType:  'RECOMMENDATION_GENERATED',
            description: `Final recommendation ${recommendationType} generated for profile_id ${profile.profile_id}. Cumulative score: ${cumulative}%.`,
            ipAddress:   getIp(req),
          });
        }
      }
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'SELF_ASSESSMENT_SUBMITTED',
      description: `Self-assessment submitted for checkpoint_id ${checkpointId} (${checkpoint.checkpoint_label}). Self-score: ${totalSelfScore}%.`,
      ipAddress:   getIp(req),
    });
    return res.status(201).json({
      success: true,
      message: 'Self-assessment submitted successfully.',
      data: { checkpoint_id: checkpointId, self_score: totalSelfScore },
    });
  } catch (error) {
    console.error('[evaluationController.submitSelfAssessment]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit self-assessment.' });
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  getProbationByProfile,
  getMyProbation,
  getCheckpoint,
  getMyTeam,
  submitManagerEvaluation,
  submitSelfAssessment,
};
