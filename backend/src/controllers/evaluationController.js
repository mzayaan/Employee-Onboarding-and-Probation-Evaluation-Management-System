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
const { calcContribution, deriveRecommendation } = require('../utils/scoringHelpers');

// G09-FIX D7: use req.ip (set by Express trust-proxy) instead of the raw
// X-Forwarded-For header which can be forged by any client.
const getIp = (req) =>
  req.ip || req.socket?.remoteAddress || 'unknown';

// G09: Probation period statuses that must reject new submissions.
// ACTIVE and EXTENDED are the only valid states for new assessments.
const TERMINAL_PERIOD_STATUSES = ['COMPLETED', 'CONFIRMED', 'DISMISSED'];

/**
 * Return today's calendar date in Mauritius Standard Time (UTC+4) as a
 * 'YYYY-MM-DD' string, suitable for DATEONLY comparisons.
 * G09-FIX D3: submission timing is enforced using local Mauritius dates so
 * that a checkpoint due on a given day can be submitted from midnight MST.
 */
const todayMST = () => {
  const MST_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4
  return new Date(Date.now() + MST_OFFSET_MS).toISOString().slice(0, 10);
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
              // Sibling checkpoints — used for the history panel in the evaluation form.
              // BUG-13 fix: Sequelize v6 ignores 'order' inside a deeply nested include
              // unless separate:true is set. Without it, checkpoints come back in insertion
              // order rather than day_number order, breaking the history panel timeline.
              model: EvaluationCheckpoint,
              as:    'checkpoints',
              separate: true,
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

    // G09-FIX D4: Criteria freezing — once any submission has been made for this
    // checkpoint the criteria configuration is frozen.  Both the manager form and
    // the employee self-assessment form must load exactly the same criteria that
    // were used for the first submission, even if the System Administrator changes
    // the global configuration between submissions.
    //
    // If the manager evaluation already exists, return the criteria that were
    // snapshotted in its EvaluationScore rows (using weight_percent_at_scoring).
    // If only the self-assessment exists (employee submitted first), use those
    // SelfAssessmentScore rows instead.
    // If neither exists yet, return the current active criteria as normal.
    // G09-FIX Fix 3 (legacy): flag whether this checkpoint has pre-G09 score rows
    // where weight_percent_at_scoring was not snapshotted.  The frontend can use
    // this to warn the reviewer before submission; both submission paths will return
    // 422 UNRESOLVED_WEIGHT_HISTORY if the flag is true.
    let hasUnresolvableWeightHistory = false;
    let criteria;
    if (checkpoint.managerEvaluation?.scores?.length > 0) {
      // Load from manager evaluation snapshot
      hasUnresolvableWeightHistory = checkpoint.managerEvaluation.scores.some(
        (s) => s.weight_percent_at_scoring == null
      );
      const frozenIds = checkpoint.managerEvaluation.scores.map((s) => s.criterion_id);
      const frozenCriteriaRaw = await EvaluationCriterion.findAll({
        where: { criterion_id: frozenIds },
        order: [['display_order', 'ASC'], ['criterion_id', 'ASC']],
      });
      // Replace weight_percent with the snapshotted weight so the form reflects
      // the exact weights that were used at submission time (FR-14).
      criteria = frozenCriteriaRaw.map((c) => {
        const snap = checkpoint.managerEvaluation.scores.find(
          (s) => s.criterion_id === c.criterion_id
        );
        const obj = c.toJSON ? c.toJSON() : { ...c.dataValues };
        if (snap?.weight_percent_at_scoring != null) {
          obj.weight_percent = snap.weight_percent_at_scoring;
        }
        // G09-FIX Fix 2: also freeze the criterion name so a later rename in the
        // System Administrator page does not change the label shown on historical
        // evaluation records (FR-14).
        if (snap?.name_at_scoring != null) {
          obj.name = snap.name_at_scoring;
        }
        return obj;
      });
    } else if (checkpoint.selfAssessment?.scores?.length > 0) {
      // Load from self-assessment snapshot (employee submitted first)
      hasUnresolvableWeightHistory = checkpoint.selfAssessment.scores.some(
        (s) => s.weight_percent_at_scoring == null
      );
      const frozenIds = checkpoint.selfAssessment.scores.map((s) => s.criterion_id);
      const frozenCriteriaRaw = await EvaluationCriterion.findAll({
        where: { criterion_id: frozenIds },
        order: [['display_order', 'ASC'], ['criterion_id', 'ASC']],
      });
      criteria = frozenCriteriaRaw.map((c) => {
        const snap = checkpoint.selfAssessment.scores.find(
          (s) => s.criterion_id === c.criterion_id
        );
        const obj = c.toJSON ? c.toJSON() : { ...c.dataValues };
        if (snap?.weight_percent_at_scoring != null) {
          obj.weight_percent = snap.weight_percent_at_scoring;
        }
        // G09-FIX Fix 2: freeze criterion name so renames don't affect historical
        // evaluation records (FR-14).
        if (snap?.name_at_scoring != null) {
          obj.name = snap.name_at_scoring;
        }
        return obj;
      });
    } else {
      // No submission yet — return current active criteria
      criteria = await EvaluationCriterion.findAll({
        where:  { is_active: true },
        order:  [['display_order', 'ASC'], ['criterion_id', 'ASC']],
      });
    }

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
          (s) => s.checkpoint_id === Number.parseInt(checkpointId, 10)
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

    // NFR-02 / NFR-08 / DPA-2017: strip payroll-sensitive fields from the
    // embedded EmployeeProfile for LINE_MANAGER and DIRECTOR callers.
    // HR_ADMIN retains full access; NEW_EMPLOYEE is already gated to their own
    // record (line 211) so they also retain their own data.
    const RESTRICTED_ROLES = ['LINE_MANAGER', 'DIRECTOR'];
    const { SENSITIVE_FIELDS } = require('./employeeController');
    const checkpointData = checkpoint.toJSON ? checkpoint.toJSON() : { ...checkpoint };

    // G09-FIX Fix 2: apply name_at_scoring to the embedded score rows so callers
    // always see the frozen name that was used at submission time — not the current
    // (possibly renamed) criterion name (FR-14).
    const applyFrozenName = (scoreList) => {
      if (!Array.isArray(scoreList)) return;
      for (const sc of scoreList) {
        if (sc?.name_at_scoring != null && sc.criterion) {
          sc.criterion = { ...sc.criterion, name: sc.name_at_scoring };
        }
      }
    };
    applyFrozenName(checkpointData.managerEvaluation?.scores);
    applyFrozenName(checkpointData.selfAssessment?.scores);

    if (RESTRICTED_ROLES.includes(req.user.role)) {
      const ep = checkpointData.probationPeriod?.employeeProfile;
      if (ep) SENSITIVE_FIELDS.forEach((f) => delete ep[f]);
    }

    return res.json({ success: true, data: checkpointData, criteria, attendanceSummary, hasUnresolvableWeightHistory });
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
      FinalRecommendation,
      ManagerEvaluation,
      User,
    } = require('../models');
    const { Op } = require('sequelize');

    const profiles = await EmployeeProfile.findAll({
      where: { manager_id: req.user.user_id },
      include: [
        {
          model:      User,
          as:         'user',
          attributes: ['user_id', 'first_name', 'last_name', 'email'],
          where:      { role: 'NEW_EMPLOYEE' }, // exclude managers/HR with profiles
          required:   true,
        },
        {
          model: ProbationPeriod,
          as:    'probationPeriods',
          // G42-FIX: Include EXTENDED periods so the manager can see employees
          // whose probation has been extended by the Director.
          where: { status: { [Op.in]: ['ACTIVE', 'EXTENDED'] } },
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
            {
              // FR-15: include APPROVED final recommendations so the manager can see
              // the outcome badge on their team overview. Using the hasMany alias
              // 'finalRecommendations' (supports multi-cycle approval workflow).
              model:      FinalRecommendation,
              as:         'finalRecommendations',
              where:      { approval_status: 'APPROVED' },
              required:   false,
              attributes: ['rec_id', 'recommendation_type', 'approval_status', 'cycle_number', 'generated_at'],
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

    // NFR-03 / NFR-08 / DPA-2017: LINE_MANAGER must not receive payroll-sensitive
    // employee fields (NIC, bank account, salary, passport, etc.).
    // Apply the same SENSITIVE_FIELDS list used by listEmployees and getEmployee.
    const { SENSITIVE_FIELDS } = require('./employeeController');
    const safeProfiles = profiles.map((p) => {
      const obj = p.toJSON ? p.toJSON() : { ...p };
      SENSITIVE_FIELDS.forEach((f) => delete obj[f]);
      return obj;
    });

    return res.json({ success: true, data: safeProfiles });
  } catch (error) {
    console.error('[evaluationController.getMyTeam]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve team data.' });
  }
};

// G09-FIX Fix 1: Custom error class for eligibility failures that occur INSIDE
// sequelize.transaction().  Throwing this exits the transaction cleanly and is
// caught in the outer try/catch to return the correct HTTP status rather than 500.
class EligibilityError extends Error {
  constructor(status, body) {
    super(body.message);
    this.status = status;
    this.body   = body;
  }
}

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
      SelfAssessmentScore,
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

    // G09-FIX Fix 5: guard before .length to prevent TypeError on null/non-array input.
    if (!Array.isArray(scores)) {
      return res.status(400).json({ success: false, message: 'scores must be an array.' });
    }
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

    // G09-FIX D2: Reject if the checkpoint itself has been cancelled.
    // A CANCELLED checkpoint is closed for all new submissions regardless of period status.
    if (checkpoint.status === 'CANCELLED') {
      return res.status(409).json({
        success: false,
        message: 'Cannot submit evaluation: this evaluation checkpoint has been cancelled.',
      });
    }

    // G07: Reject submission if the probation period has been cancelled (e.g. because
    // a no-probation contract was subsequently created for this employee).
    // Preserving COMPLETED evaluations is intentional; this guard only blocks NEW ones.
    if (checkpoint.probationPeriod?.status === 'CANCELLED') {
      return res.status(409).json({
        success: false,
        message: 'Cannot submit evaluation: the probation period has been cancelled.',
      });
    }

    // G09-FIX D1: Reject if the probation period has already reached a terminal state.
    // New assessments are only valid while the period is ACTIVE or EXTENDED.
    if (TERMINAL_PERIOD_STATUSES.includes(checkpoint.probationPeriod?.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot submit evaluation: the probation period is already ${(checkpoint.probationPeriod.status || '').toLowerCase()}.`,
      });
    }

    // G09-FIX D3: Submission timing — the checkpoint must be on or past its due date
    // (Mauritius Standard Time UTC+4; DATEONLY comparison so midnight MST counts).
    // Overdue submissions against an ACTIVE/EXTENDED period are always accepted.
    if (checkpoint.due_date > todayMST()) {
      return res.status(422).json({
        success: false,
        message: `This checkpoint is not yet due. Submissions open from ${checkpoint.due_date} (Mauritius time).`,
      });
    }

    const profile = checkpoint.probationPeriod?.employeeProfile;
    if (req.user.role === 'LINE_MANAGER' && profile?.manager_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // G09-FIX Fix 5 (enhanced): validate score array shape before the transaction
    // so obvious format errors fail fast without acquiring a database lock.
    // Semantic validation (valid criterion_id, complete coverage) and score building
    // happen inside the transaction after criteria are loaded atomically (Fix 1).
    {
      if (!Array.isArray(scores)) {
        return res.status(400).json({ success: false, message: 'scores must be an array.' });
      }
      const seenCriterionIds = new Set();
      for (const s of scores) {
        if (s == null) {
          return res.status(400).json({ success: false, message: 'Score entries must not be null.' });
        }
        // Reject booleans AND objects/arrays — both coerce to numbers silently.
        if (typeof s.criterion_id === 'boolean' || typeof s.criterion_id === 'object' ||
            typeof s.raw_score   === 'boolean' || typeof s.raw_score   === 'object') {
          return res.status(400).json({ success: false, message: 'criterion_id and raw_score must be numbers or numeric strings, not booleans or arrays.' });
        }
        const idStr = String(s.criterion_id ?? '').trim();
        if (!/^\d+$/.test(idStr)) {
          return res.status(400).json({ success: false, message: 'criterion_id must be a positive integer.' });
        }
        const id = Number.parseInt(idStr, 10);
        if (id <= 0) {
          return res.status(400).json({ success: false, message: 'criterion_id must be a positive integer.' });
        }
        if (seenCriterionIds.has(id)) {
          return res.status(400).json({ success: false, message: `Duplicate criterion_id ${id} in submission.` });
        }
        seenCriterionIds.add(id);
        const rawNum = Number(s.raw_score);
        if (!Number.isFinite(rawNum) || !Number.isInteger(rawNum)) {
          return res.status(400).json({ success: false, message: `raw_score must be a whole number between 1 and 5. Received: ${s.raw_score}` });
        }
        // Normalise to native number types for downstream arithmetic
        s.criterion_id = id;
        s.raw_score    = rawNum;
      }
    }

    // Semantic validation (criterion IDs, completeness), score building, and
    // totalWeighted calculation happen inside the transaction after criteria are
    // loaded atomically under the checkpoint row lock (G09-FIX Fix 1).
    let totalWeighted;

    // G09-FIX Fix 1: Criteria loading, score building, and period-status recheck
    // all happen INSIDE the transaction after the row lock so two concurrent
    // submissions always see a consistent criteria configuration (FR-14).
    await sequelize.transaction(async (t) => {
      // Lock the checkpoint row; also fetch parent period status so both can be
      // rechecked atomically without a second round-trip.
      const lockedCp = await EvaluationCheckpoint.findByPk(checkpointId, {
        lock:        t.LOCK.UPDATE,
        transaction: t,
        include: [{
          model:      ProbationPeriod,
          as:         'probationPeriod',
          attributes: ['period_id', 'status'],
        }],
      });
      if (!lockedCp) {
        throw new EligibilityError(404, { success: false, message: 'Checkpoint not found.' });
      }
      const atomicDuplicateMgr = await ManagerEvaluation.findOne({
        where: { checkpoint_id: checkpointId },
        transaction: t,
      });
      if (atomicDuplicateMgr) {
        throw new EligibilityError(409, { success: false, message: 'Manager evaluation already submitted for this checkpoint.' });
      }
      if (lockedCp.status === 'CANCELLED') {
        throw new EligibilityError(409, {
          success: false,
          message: 'Cannot submit evaluation: this evaluation checkpoint has been cancelled.',
        });
      }
      // G09-FIX Fix 1 (period): recheck parent period status inside the lock so
      // a concurrent cancellation or finalisation is detected here.
      const lockedPeriodStatus = lockedCp.probationPeriod?.status;
      if (lockedPeriodStatus === 'CANCELLED') {
        throw new EligibilityError(409, {
          success: false,
          message: 'Cannot submit evaluation: the probation period has been cancelled.',
        });
      }
      if (TERMINAL_PERIOD_STATUSES.includes(lockedPeriodStatus)) {
        throw new EligibilityError(409, {
          success: false,
          message: `Cannot submit evaluation: the probation period has been ${lockedPeriodStatus?.toLowerCase() ?? 'finalised'}.`,
        });
      }

      // G09-FIX Fix 1 (criteria): load criteria INSIDE the transaction so the
      // frozen set is consistent with the state at the time the lock was acquired.
      // G09-FIX Fix 3 (NULL weight): when the first submitter's snapshot has NULL
      // weights (pre-G09 row), still use those criterion IDs but fetch their current
      // weights — do NOT fall back to all active criteria (which may have changed).
      const txCriteriaMap = {};
      const txSelfSnap = await SelfAssessment.findOne({
        where: { checkpoint_id: checkpointId },
        include: [{
          model:      SelfAssessmentScore,
          as:         'scores',
            // G09-FIX Fix 3 (legacy): weight_percent_at_scoring is the authoritative
          // snapshot; raw_score and weighted_contribution are no longer fetched because
          // inversion is unreliable on rounded decimals (see 68.74/31.26 example).
          // name_at_scoring is fetched so the second submission freezes the same label
          // as the first (FR-14).
          attributes: ['criterion_id', 'weight_percent_at_scoring', 'name_at_scoring'],
        }],
        transaction: t,
      });
      let txFrozenByEmployee = false;
      if (txSelfSnap?.scores?.length > 0) {
        txFrozenByEmployee = true;
        // G09-FIX Fix 3 (legacy): any NULL weight_percent_at_scoring means this is a
        // pre-G09 row.  Recovering the original weight via (contribution × 5) / raw_score
        // is unreliable: weighted_contribution is stored as a rounded decimal, so
        // inversion introduces rounding error (e.g. weights of 68.74 % and 31.26 %
        // both map to the same rounded contribution at limited decimal precision).
        // Reject unconditionally with UNRESOLVED_WEIGHT_HISTORY so the second submission
        // cannot silently use an incorrect weight (FR-14).
        const hasNullWeight = txSelfSnap.scores.some((s) => s.weight_percent_at_scoring == null);
        if (hasNullWeight) {
          throw new EligibilityError(422, {
            success: false,
            message: 'This checkpoint has unresolved weight history: the original evaluation weights cannot be reliably recovered from pre-G09 data. Please contact your System Administrator to resolve this checkpoint before the second submission can proceed.',
            code: 'UNRESOLVED_WEIGHT_HISTORY',
          });
        }
        const frozenIds      = txSelfSnap.scores.map((s) => s.criterion_id);
        const frozenCriteria = await EvaluationCriterion.findAll({
          where: { criterion_id: frozenIds },
          transaction: t,
        });
        for (const c of frozenCriteria) {
          const base = c.toJSON ? c.toJSON() : { ...c.dataValues };
          const snap = txSelfSnap.scores.find((s) => s.criterion_id === c.criterion_id);
          // All weights are non-NULL — use the snapshot value directly.
          base.weight_percent = Number.parseFloat(snap.weight_percent_at_scoring);
          // G09-FIX Fix 2: carry the frozen criterion name so a rename after the
          // first submission does not corrupt the second submission's stored label.
          if (snap?.name_at_scoring != null) {
            base.name = snap.name_at_scoring;
          }
          txCriteriaMap[c.criterion_id] = base;
        }
      }
      if (!txFrozenByEmployee) {
        const allCriteria = await EvaluationCriterion.findAll({
          where:       { is_active: true },
          transaction: t,
        });
        for (const c of allCriteria) {
          txCriteriaMap[c.criterion_id] = c;
        }
        const totalCriteriaWeight = allCriteria.reduce(
          (sum, c) => sum + Number.parseFloat(c.weight_percent), 0
        );
        if (Math.abs(totalCriteriaWeight - 100) > 0.01) {
          throw new EligibilityError(422, {
            success: false,
            message: `Evaluation criteria weights must total 100%. Current total: ${totalCriteriaWeight.toFixed(2)}%. Please ask the System Administrator to update the criteria configuration.`,
          });
        }
      }

      // Semantic validation: scores must reference the (frozen or active) criteria set
      for (const s of scores) {
        if (!txCriteriaMap[s.criterion_id]) {
          const ctx = txFrozenByEmployee ? 'frozen criteria for this checkpoint' : 'active criteria';
          throw new EligibilityError(400, {
            success: false,
            message: `Invalid criterion_id: ${s.criterion_id}. Must match the ${ctx}.`,
          });
        }
        if (s.raw_score < 1 || s.raw_score > 5) {
          throw new EligibilityError(400, { success: false, message: 'Each score must be between 1 and 5.' });
        }
      }
      const submittedCriterionIds = new Set(scores.map((s) => String(s.criterion_id)));
      const missingCriterionIds   = Object.keys(txCriteriaMap).filter((id) => !submittedCriterionIds.has(id));
      if (missingCriterionIds.length > 0) {
        throw new EligibilityError(400, {
          success: false,
          message: `Scores must be provided for all ${Object.keys(txCriteriaMap).length} criteria. Missing criterion IDs: ${missingCriterionIds.join(', ')}.`,
        });
      }

      // Build score rows and compute totalWeighted (inside transaction for consistency)
      let _totalWeighted = 0;
      const txScoreRows = scores.map((s) => {
        const weightAtScoring = txCriteriaMap[s.criterion_id].weight_percent;
        const contribution    = calcContribution(s.raw_score, weightAtScoring);
        _totalWeighted += contribution;
        return {
          criterion_id:              s.criterion_id,
          raw_score:                 s.raw_score,
          weight_percent_at_scoring: weightAtScoring,
          name_at_scoring:           txCriteriaMap[s.criterion_id].name ?? null,
          weighted_contribution:     contribution,
        };
      });
      totalWeighted = Number.parseFloat(_totalWeighted.toFixed(2));

      // Create manager evaluation record
      const evaluation = await ManagerEvaluation.create({
        checkpoint_id:           checkpointId,
        evaluated_by:            req.user.user_id,
        attendance_days_present: Number(attendance_days_present),
        attendance_days_absent:  Number(attendance_days_absent),
        late_arrivals:           Number(late_arrivals),
        weighted_score:          totalWeighted,
        submitted_at:            new Date(),
      }, { transaction: t });

      // Create individual score rows
      await EvaluationScore.bulkCreate(
        txScoreRows.map((r) => ({ ...r, eval_id: evaluation.eval_id })),
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
            .map((c) => Number.parseFloat(c.managerEvaluation?.weighted_score || 0));
          const cumulative = Number.parseFloat(
            (evalScores.reduce((a, b) => a + b, 0) / (evalScores.length || 1)).toFixed(2)
          );
          const recommendationType = deriveRecommendation(cumulative);

          // Submit recommendation to HR for review (3-stage approval workflow).
          // ProbationPeriod.status stays ACTIVE until the Director approves
          // (directorController.approveRecommendation handles the final transition).
          //
          // cycle_number FIX: Each evaluation cycle (initial + each EXTEND extension)
          // gets its own row identified by (period_id, cycle_number).  Count the
          // number of APPROVED records to determine which cycle we are on.
          const approvedCount1 = await FinalRecommendation.count({
            where: { period_id: period.period_id, approval_status: 'APPROVED' },
            transaction: t,
          });
          const currentCycle1 = approvedCount1 + 1;
          await FinalRecommendation.findOrCreate({
            where: {
              period_id:    period.period_id,
              cycle_number: currentCycle1,
            },
            defaults: {
              recommendation_type: recommendationType,
              cumulative_score:    cumulative,
              cycle_number:        currentCycle1,
              generated_at:        new Date(),
              generated_by:        req.user.user_id,
              submitted_by:        req.user.user_id,
              approval_status:     'PENDING_HR_REVIEW',
            },
            transaction: t,
          });

          // Update cumulative score and recommendation type on the period;
          // do NOT change period.status here — that is the Director's action.
          await period.update({
            cumulative_score:     cumulative,
            final_recommendation: recommendationType,
            updated_at:           new Date(),
          }, { transaction: t });

          await createAuditLog({
            userId:      req.user.user_id,
            actionType:  'RECOMMENDATION_SUBMITTED',
            description: `Final recommendation "${recommendationType}" submitted for HR review. Profile_id ${profile.profile_id}. Cumulative score: ${cumulative}%. Approval status: PENDING_HR_REVIEW.`,
            ipAddress:   getIp(req),
          });

          // Notify all active HR admins (fire-and-forget)
          const { User: _HRUser } = require('../models');
          const { createNotification: _notifHR } = require('../services/notificationService');
          _HRUser.findAll({ where: { role: 'HR_ADMIN', is_active: true }, attributes: ['user_id'] })
            .then((hrUsers) => hrUsers.forEach((hr) => _notifHR({
              userId:  hr.user_id,
              type:    'RECOMMENDATION_PENDING',
              message: `A probation recommendation (${recommendationType}) requires your review. Profile ID: ${profile.profile_id}.`,
              relatedEntityType: 'recommendation',
              relatedEntityId:   null,
            }).catch(() => {})))
            .catch(() => {});
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
    // G09-FIX Fix 1: EligibilityError is thrown inside the transaction to signal a
    // business-logic rejection; return its HTTP status rather than a generic 500.
    if (error instanceof EligibilityError) {
      return res.status(error.status).json(error.body);
    }
    console.error('[evaluationController.submitManagerEvaluation]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit evaluation.' });
  }
};

// =============================================================================
// POST /api/evaluations/checkpoint/:checkpointId/self
// Employee submits their own self-assessment.
// Body: { scores: [{criterion_id, raw_score}], self_reflection_notes,
//         onboarding_progress_notes, understands_responsibilities,
//         received_sufficient_training, has_required_system_access,
//         areas_needing_support, training_support_requested,
//         employee_comments, employee_acknowledgement_date }
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
      EvaluationScore,
      SelfAssessment,
      SelfAssessmentScore,
      FinalRecommendation,
    } = require('../models');
    const sequelize = require('../config/database');

    const { checkpointId } = req.params;
    const {
      scores                       = [],
      self_reflection_notes        = '',
      // Two-way probation feedback fields (FR-13)
      onboarding_progress_notes,
      understands_responsibilities,
      received_sufficient_training,
      has_required_system_access,
      areas_needing_support,
      training_support_requested,
      employee_comments,
      employee_acknowledgement_date,
    } = req.body;

    // G09-FIX Fix 5: guard before .length to prevent TypeError on null/non-array input.
    if (!Array.isArray(scores)) {
      return res.status(400).json({ success: false, message: 'scores must be an array.' });
    }
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
            { model: EmployeeProfile, as: 'employeeProfile', attributes: ['profile_id', 'user_id', 'manager_id'] },
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

    // G09-FIX D2: Reject if the checkpoint itself has been cancelled.
    if (checkpoint.status === 'CANCELLED') {
      return res.status(409).json({
        success: false,
        message: 'Cannot submit self-assessment: this evaluation checkpoint has been cancelled.',
      });
    }

    // G07: Reject submission if the probation period has been cancelled.
    if (checkpoint.probationPeriod?.status === 'CANCELLED') {
      return res.status(409).json({
        success: false,
        message: 'Cannot submit self-assessment: the probation period has been cancelled.',
      });
    }

    // G09-FIX D1: Reject if the probation period has already reached a terminal state.
    if (TERMINAL_PERIOD_STATUSES.includes(checkpoint.probationPeriod?.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot submit self-assessment: the probation period is already ${(checkpoint.probationPeriod.status || '').toLowerCase()}.`,
      });
    }

    // G09-FIX D3: Submission timing — the checkpoint must be on or past its due date
    // (Mauritius Standard Time UTC+4; DATEONLY comparison).
    if (checkpoint.due_date > todayMST()) {
      return res.status(422).json({
        success: false,
        message: `This checkpoint is not yet due. Submissions open from ${checkpoint.due_date} (Mauritius time).`,
      });
    }

    // G09-FIX Fix 5 (enhanced): validate score array shape before the transaction
    // so obvious format errors fail fast without acquiring a database lock.
    // Semantic validation, score building, and totalSelfScore happen inside the
    // transaction after criteria are loaded atomically (Fix 1).
    {
      if (!Array.isArray(scores)) {
        return res.status(400).json({ success: false, message: 'scores must be an array.' });
      }
      const seenCriterionIds = new Set();
      for (const s of scores) {
        if (s == null) {
          return res.status(400).json({ success: false, message: 'Score entries must not be null.' });
        }
        // Reject booleans AND objects/arrays — both coerce to numbers silently.
        if (typeof s.criterion_id === 'boolean' || typeof s.criterion_id === 'object' ||
            typeof s.raw_score   === 'boolean' || typeof s.raw_score   === 'object') {
          return res.status(400).json({ success: false, message: 'criterion_id and raw_score must be numbers or numeric strings, not booleans or arrays.' });
        }
        const idStr = String(s.criterion_id ?? '').trim();
        if (!/^\d+$/.test(idStr)) {
          return res.status(400).json({ success: false, message: 'criterion_id must be a positive integer.' });
        }
        const id = Number.parseInt(idStr, 10);
        if (id <= 0) {
          return res.status(400).json({ success: false, message: 'criterion_id must be a positive integer.' });
        }
        if (seenCriterionIds.has(id)) {
          return res.status(400).json({ success: false, message: `Duplicate criterion_id ${id} in submission.` });
        }
        seenCriterionIds.add(id);
        const rawNum = Number(s.raw_score);
        if (!Number.isFinite(rawNum) || !Number.isInteger(rawNum)) {
          return res.status(400).json({ success: false, message: `raw_score must be a whole number between 1 and 5. Received: ${s.raw_score}` });
        }
        s.criterion_id = id;
        s.raw_score    = rawNum;
      }
    }

    // Semantic validation, score building, and totalSelfScore calculation happen
    // inside the transaction after criteria are loaded atomically (G09-FIX Fix 1).
    let totalSelfScore;

    // NFR-03 / FR-15: a line manager must be assigned so the final recommendation
    // can be attributed to the correct user.  Reject before the transaction so
    // the self-assessment write is not silently rolled back alongside this error.
    if (!profile.manager_id) {
      return res.status(422).json({
        success: false,
        message: 'No line manager has been assigned to your profile. Please contact HR to assign a manager before submitting your self-assessment.',
      });
    }

    // G09-FIX Fix 1: Criteria loading, score building, and period-status recheck
    // all happen INSIDE the transaction after the row lock (FR-14).
    await sequelize.transaction(async (t) => {
      // Lock the checkpoint row; also fetch parent period status atomically.
      const lockedCpSelf = await EvaluationCheckpoint.findByPk(checkpointId, {
        lock:        t.LOCK.UPDATE,
        transaction: t,
        include: [{
          model:      ProbationPeriod,
          as:         'probationPeriod',
          attributes: ['period_id', 'status'],
        }],
      });
      if (!lockedCpSelf) {
        throw new EligibilityError(404, { success: false, message: 'Checkpoint not found.' });
      }
      const atomicDuplicateSelf = await SelfAssessment.findOne({
        where: { checkpoint_id: checkpointId },
        transaction: t,
      });
      if (atomicDuplicateSelf) {
        throw new EligibilityError(409, { success: false, message: 'Self-assessment already submitted for this checkpoint.' });
      }
      if (lockedCpSelf.status === 'CANCELLED') {
        throw new EligibilityError(409, {
          success: false,
          message: 'Cannot submit self-assessment: this evaluation checkpoint has been cancelled.',
        });
      }
      // G09-FIX Fix 1 (period): recheck parent period status inside the lock.
      const lockedSelfPeriodStatus = lockedCpSelf.probationPeriod?.status;
      if (lockedSelfPeriodStatus === 'CANCELLED') {
        throw new EligibilityError(409, {
          success: false,
          message: 'Cannot submit self-assessment: the probation period has been cancelled.',
        });
      }
      if (TERMINAL_PERIOD_STATUSES.includes(lockedSelfPeriodStatus)) {
        throw new EligibilityError(409, {
          success: false,
          message: `Cannot submit self-assessment: the probation period has been ${lockedSelfPeriodStatus?.toLowerCase() ?? 'finalised'}.`,
        });
      }

      // G09-FIX Fix 1 (criteria): load criteria INSIDE the transaction.
      // G09-FIX Fix 3 (NULL weight): when the first submitter's snapshot has NULL
      // weights, still use those criterion IDs with current weights.
      const txCriteriaMapSelf = {};
      const txMgrSnap = await ManagerEvaluation.findOne({
        where: { checkpoint_id: checkpointId },
        include: [{
          model:      EvaluationScore,
          as:         'scores',
            // G09-FIX Fix 3 (legacy): weight_percent_at_scoring is the authoritative
          // snapshot; raw_score and weighted_contribution are no longer fetched because
          // inversion is unreliable on rounded decimals (see 68.74/31.26 example).
          // name_at_scoring is fetched so the second submission freezes the same label
          // as the first (FR-14).
          attributes: ['criterion_id', 'weight_percent_at_scoring', 'name_at_scoring'],
        }],
        transaction: t,
      });
      let txFrozenByManager = false;
      if (txMgrSnap?.scores?.length > 0) {
        txFrozenByManager = true;
        // G09-FIX Fix 3 (legacy): any NULL weight_percent_at_scoring means this is a
        // pre-G09 row.  Recovering the original weight via (contribution × 5) / raw_score
        // is unreliable: weighted_contribution is stored as a rounded decimal, so
        // inversion introduces rounding error (e.g. weights of 68.74 % and 31.26 %
        // both map to the same rounded contribution at limited decimal precision).
        // Reject unconditionally with UNRESOLVED_WEIGHT_HISTORY so the second submission
        // cannot silently use an incorrect weight (FR-14).
        const hasNullWeight = txMgrSnap.scores.some((s) => s.weight_percent_at_scoring == null);
        if (hasNullWeight) {
          throw new EligibilityError(422, {
            success: false,
            message: 'This checkpoint has unresolved weight history: the original evaluation weights cannot be reliably recovered from pre-G09 data. Please contact your System Administrator to resolve this checkpoint before the second submission can proceed.',
            code: 'UNRESOLVED_WEIGHT_HISTORY',
          });
        }
        const frozenIds      = txMgrSnap.scores.map((s) => s.criterion_id);
        const frozenCriteria = await EvaluationCriterion.findAll({
          where: { criterion_id: frozenIds },
          transaction: t,
        });
        for (const c of frozenCriteria) {
          const base = c.toJSON ? c.toJSON() : { ...c.dataValues };
          const snap = txMgrSnap.scores.find((s) => s.criterion_id === c.criterion_id);
          // All weights are non-NULL — use the snapshot value directly.
          base.weight_percent = Number.parseFloat(snap.weight_percent_at_scoring);
          // G09-FIX Fix 2: carry the frozen criterion name so a rename after the
          // first submission does not corrupt the second submission's stored label.
          if (snap?.name_at_scoring != null) {
            base.name = snap.name_at_scoring;
          }
          txCriteriaMapSelf[c.criterion_id] = base;
        }
      }
      if (!txFrozenByManager) {
        const allCriteria = await EvaluationCriterion.findAll({
          where:       { is_active: true },
          transaction: t,
        });
        for (const c of allCriteria) {
          txCriteriaMapSelf[c.criterion_id] = c;
        }
        const totalCriteriaWeight = allCriteria.reduce(
          (sum, c) => sum + Number.parseFloat(c.weight_percent), 0
        );
        if (Math.abs(totalCriteriaWeight - 100) > 0.01) {
          throw new EligibilityError(422, {
            success: false,
            message: `Evaluation criteria weights must total 100%. Current total: ${totalCriteriaWeight.toFixed(2)}%. Please ask the System Administrator to update the criteria configuration.`,
          });
        }
      }

      // Semantic validation
      for (const s of scores) {
        if (!txCriteriaMapSelf[s.criterion_id]) {
          const ctx = txFrozenByManager ? 'frozen criteria for this checkpoint' : 'active criteria';
          throw new EligibilityError(400, {
            success: false,
            message: `Invalid criterion_id: ${s.criterion_id}. Must match the ${ctx}.`,
          });
        }
        if (s.raw_score < 1 || s.raw_score > 5) {
          throw new EligibilityError(400, { success: false, message: 'Each score must be between 1 and 5.' });
        }
      }
      const submittedSelfCriterionIds = new Set(scores.map((s) => String(s.criterion_id)));
      const missingSelfCriterionIds   = Object.keys(txCriteriaMapSelf).filter((id) => !submittedSelfCriterionIds.has(id));
      if (missingSelfCriterionIds.length > 0) {
        throw new EligibilityError(400, {
          success: false,
          message: `Scores must be provided for all ${Object.keys(txCriteriaMapSelf).length} criteria. Missing criterion IDs: ${missingSelfCriterionIds.join(', ')}.`,
        });
      }

      // Build score rows and compute totalSelfScore (inside transaction for consistency)
      let _totalSelfScore = 0;
      const txSelfScoreRows = scores.map((s) => {
        const weightAtScoring = txCriteriaMapSelf[s.criterion_id].weight_percent;
        const contribution    = calcContribution(s.raw_score, weightAtScoring);
        _totalSelfScore += contribution;
        return {
          criterion_id:              s.criterion_id,
          raw_score:                 s.raw_score,
          weight_percent_at_scoring: weightAtScoring,
          name_at_scoring:           txCriteriaMapSelf[s.criterion_id].name ?? null,
          weighted_contribution:     contribution,
        };
      });
      totalSelfScore = Number.parseFloat(_totalSelfScore.toFixed(2));

      const assessment = await SelfAssessment.create({
        checkpoint_id:                 checkpointId,
        employee_profile_id:           profile.profile_id,
        self_reflection_notes:         self_reflection_notes?.trim()          || null,
        self_score:                    totalSelfScore,
        submitted_at:                  new Date(),
        // Two-way probation feedback fields (FR-13)
        onboarding_progress_notes:     onboarding_progress_notes?.trim()      || null,
        understands_responsibilities:  understands_responsibilities            || null,
        received_sufficient_training:  received_sufficient_training            || null,
        has_required_system_access:    has_required_system_access              || null,
        areas_needing_support:         areas_needing_support?.trim()           || null,
        training_support_requested:    training_support_requested?.trim()      || null,
        employee_comments:             employee_comments?.trim()               || null,
        employee_acknowledgement_date: employee_acknowledgement_date           || null,
      }, { transaction: t });

      await SelfAssessmentScore.bulkCreate(
        txSelfScoreRows.map((r) => ({ ...r, assessment_id: assessment.assessment_id })),
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
            .map((c) => Number.parseFloat(c.managerEvaluation?.weighted_score || 0));
          const cumulative = Number.parseFloat(
            (evalScores.reduce((a, b) => a + b, 0) / (evalScores.length || 1)).toFixed(2)
          );
          const recommendationType = deriveRecommendation(cumulative);

          // Submit recommendation to HR for review (3-stage approval workflow).
          // ProbationPeriod.status stays ACTIVE until the Director approves.
          // submitted_by is the line manager (profile.manager_id), not the employee
          // who triggered this code path by completing their self-assessment (FR-15).
          //
          // cycle_number FIX: same second-cycle pattern as submitManagerEvaluation above.
          const approvedCount2 = await FinalRecommendation.count({
            where: { period_id: period.period_id, approval_status: 'APPROVED' },
            transaction: t,
          });
          const currentCycle2 = approvedCount2 + 1;
          await FinalRecommendation.findOrCreate({
            where: {
              period_id:    period.period_id,
              cycle_number: currentCycle2,
            },
            defaults: {
              recommendation_type: recommendationType,
              cumulative_score:    cumulative,
              cycle_number:        currentCycle2,
              generated_at:        new Date(),
              generated_by:        req.user.user_id,
              submitted_by:        profile.manager_id,
              approval_status:     'PENDING_HR_REVIEW',
            },
            transaction: t,
          });

          // Update cumulative score and recommendation type only;
          // period.status remains ACTIVE until Director approves.
          await period.update({
            cumulative_score:     cumulative,
            final_recommendation: recommendationType,
            updated_at:           new Date(),
          }, { transaction: t });

          await createAuditLog({
            userId:      req.user.user_id,
            actionType:  'RECOMMENDATION_SUBMITTED',
            description: `Final recommendation "${recommendationType}" submitted for HR review via self-assessment. Profile_id ${profile.profile_id}. Cumulative score: ${cumulative}%. Approval status: PENDING_HR_REVIEW.`,
            ipAddress:   getIp(req),
          });

          // Notify HR admins (fire-and-forget)
          const { User: _HRUser2 } = require('../models');
          const { createNotification: _notifHR2 } = require('../services/notificationService');
          _HRUser2.findAll({ where: { role: 'HR_ADMIN', is_active: true }, attributes: ['user_id'] })
            .then((hrUsers) => hrUsers.forEach((hr) => _notifHR2({
              userId:  hr.user_id,
              type:    'RECOMMENDATION_PENDING',
              message: `A probation recommendation (${recommendationType}) requires your review. Profile ID: ${profile.profile_id}.`,
              relatedEntityType: 'recommendation',
              relatedEntityId:   null,
            }).catch(() => {})))
            .catch(() => {});
        }
      }
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'SELF_ASSESSMENT_SUBMITTED',
      description: `Self-assessment submitted for checkpoint_id ${checkpointId} (${checkpoint.checkpoint_label}). Self-score: ${totalSelfScore}%.`,
      ipAddress:   getIp(req),
    });

    // G5-FIX FR-13: Notify the line manager that the employee has submitted their self-assessment.
    const { EmployeeProfile: _EP } = require('../models');
    const { createNotification: _notifMgr } = require('../services/notificationService');
    _EP.findByPk(profile.profile_id, { attributes: ['manager_id'] })
      .then((ep) => {
        if (!ep?.manager_id) return;
        _notifMgr({
          userId:            ep.manager_id,
          type:              'SELF_ASSESSMENT_SUBMITTED',
          message:           `${req.user.first_name} ${req.user.last_name} has submitted their self-assessment for the ${checkpoint.checkpoint_label} checkpoint.`,
          relatedEntityType: 'checkpoint',
          relatedEntityId:   checkpoint.checkpoint_id,
        }).catch(() => {});
      })
      .catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Self-assessment submitted successfully.',
      data: { checkpoint_id: checkpointId, self_score: totalSelfScore },
    });
  } catch (error) {
    // G09-FIX Fix 1: EligibilityError from inside the transaction.
    if (error instanceof EligibilityError) {
      return res.status(error.status).json(error.body);
    }
    console.error('[evaluationController.submitSelfAssessment]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit self-assessment.' });
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Route handlers
  getProbationByProfile,
  getMyProbation,
  getCheckpoint,
  getMyTeam,
  submitManagerEvaluation,
  submitSelfAssessment,
  // Pure scoring helpers — exported for unit testing (FR-14)
  calcContribution,
  deriveRecommendation,
};
