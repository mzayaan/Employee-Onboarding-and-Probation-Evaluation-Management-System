// =============================================================================
// src/controllers/contractController.js
// Handles employment contract creation, retrieval, and digital signing.
//
// WRA 2019 s.13 probation rules are enforced via the enforceProbationClause
// middleware mounted in contractRoutes.js on the POST / route.
//
// FR-04 (extended) | NFR-02, NFR-03, NFR-08 | Objective 1
// =============================================================================

const { sequelize, Contract, EmployeeProfile, User, ProbationPeriod, EvaluationCheckpoint } = require('../models');
const { createAuditLog } = require('../utils/auditLogger');
const { Op }             = require('sequelize');

// Permitted probation durations (months) — mirrors frontend CHECKPOINT_MATRIX (spec s.1.4).
const ALLOWED_PROBATION_MONTHS = new Set([1, 2, 3, 6, 12]);

// =============================================================================
// GET /api/contracts/mine  (NEW_EMPLOYEE)
// Returns the contract linked to the authenticated employee's profile.
// =============================================================================
const getMyContract = async (req, res) => {
  try {
    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
    });

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const contract = await Contract.findOne({
      where: { profile_id: profile.profile_id },
    });

    if (!contract) {
      return res.status(404).json({ success: false, message: 'No contract linked to your profile yet.' });
    }

    return res.json({ success: true, data: contract });
  } catch (err) {
    console.error('[contractController.getMyContract]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve contract.' });
  }
};

// =============================================================================
// GET /api/contracts/profile/:profileId  (HR_ADMIN)
// Returns the contract for a given employee profile (HR review).
// =============================================================================
const getContractByProfile = async (req, res) => {
  try {
    const { profileId } = req.params;

    const contract = await Contract.findOne({
      where: { profile_id: profileId },
      include: [
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email'] }],
        },
      ],
    });

    if (!contract) {
      return res.status(404).json({ success: false, message: 'No contract found for this profile.' });
    }

    return res.json({ success: true, data: contract });
  } catch (err) {
    console.error('[contractController.getContractByProfile]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve contract.' });
  }
};

// =============================================================================
// POST /api/contracts  (HR_ADMIN)
// Creates a new contract record for an employee profile.
// enforceProbationClause middleware runs before this handler and sets
// req.skipCheckpointGeneration when probation_clause_included = false.
// =============================================================================
const createContract = async (req, res) => {
  try {
    const {
      profile_id,
      contract_reference,
      contract_type,
      probation_duration_months,
      probation_clause_included: rawClause,
      basic_salary_mur,
      notice_period_days,
      cloudinary_url,
      contract_end_date,
    } = req.body;

    // ── Required fields ───────────────────────────────────────────────────────
    if (!profile_id || !contract_type || !basic_salary_mur) {
      return res.status(400).json({
        success: false,
        message: 'profile_id, contract_type and basic_salary_mur are required.',
      });
    }

    // ── G07 Area 1: Normalise probation_clause_included to a strict boolean ──
    // Accept boolean false, the string 'false', or the integer 0 as "no clause".
    const clauseIncluded = !(rawClause === false || rawClause === 'false' || rawClause === 0);

    // ── G07 Area 2: Probation-duration consistency ────────────────────────────
    // Only validate when a probation clause is included; a no-probation contract
    // has no meaningful duration.
    const durMonths = probation_duration_months != null
      ? Number(probation_duration_months)
      : null;

    if (clauseIncluded) {
      if (durMonths !== null) {
        // Reject fractional / non-integer values explicitly
        if (!Number.isInteger(durMonths)) {
          return res.status(400).json({
            success: false,
            message: `probation_duration_months must be a whole number, received: ${probation_duration_months}.`,
          });
        }
        // Reject negative values
        if (durMonths < 0) {
          return res.status(400).json({
            success: false,
            message: `probation_duration_months must not be negative, received: ${durMonths}.`,
          });
        }
        // Reject values not in the agreed set
        if (!ALLOWED_PROBATION_MONTHS.has(durMonths)) {
          return res.status(400).json({
            success: false,
            message: `probation_duration_months must be one of: ${[...ALLOWED_PROBATION_MONTHS].sort((a, b) => a - b).join(', ')}. Received: ${durMonths}.`,
          });
        }
      }

      // Conflict guard: reject a duration change when scored checkpoints already exist.
      // This prevents retroactively altering a probation timeline that has evidence.
      if (durMonths !== null) {
        const scoredCount = await EvaluationCheckpoint.count({
          include: [{
            association: 'probationPeriod',
            where:       { profile_id },
            required:    true,
          }],
          where: { status: 'COMPLETED' },
        });
        if (scoredCount > 0) {
          return res.status(409).json({
            success: false,
            message: 'probation_duration_months cannot be changed once evaluation checkpoints have been completed.',
          });
        }
      }
    }

    // ── G07 Area 3: Fixed-term contract_end_date ──────────────────────────────
    if (contract_type === 'FIXED_TERM') {
      if (!contract_end_date) {
        return res.status(400).json({
          success: false,
          message: 'contract_end_date is required for FIXED_TERM contracts.',
        });
      }

      // Validate end date is after the employee's employment start date.
      const profile = await EmployeeProfile.findByPk(profile_id, {
        attributes: ['start_date'],
      });
      if (profile && profile.start_date && contract_end_date <= profile.start_date) {
        return res.status(400).json({
          success: false,
          message: `contract_end_date (${contract_end_date}) must be after the employee's start date (${profile.start_date}).`,
        });
      }
    }

    // ── Duplicate guard ───────────────────────────────────────────────────────
    const existing = await Contract.findOne({ where: { profile_id } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A contract already exists for this employee. Use PATCH to update it.',
      });
    }

    // ── G07 Area 4: Atomic transaction ───────────────────────────────────────
    // Contract creation + profile/period/checkpoint updates all share one
    // transaction so a mid-write failure cannot leave the DB in a partial state.
    const contract = await sequelize.transaction(async (t) => {
      const created = await Contract.create({
        profile_id,
        contract_reference:        contract_reference || null,
        contract_type,
        probation_duration_months: durMonths ?? 3,
        probation_clause_included: clauseIncluded,
        basic_salary_mur,
        notice_period_days:        notice_period_days ?? 14,
        cloudinary_url:            cloudinary_url || null,
        contract_end_date:         contract_end_date || null,
        created_at:                new Date(),
      }, { transaction: t });

      // ── G07 Area 1 (continued): No-probation reconciliation ───────────────
      // When the contract has no probation clause the employee is PERMANENT from
      // day one (WRA 2019 s.13).  Any ACTIVE or EXTENDED probation period created
      // at employee-registration time must be cancelled; its pending checkpoints
      // are cancelled too.  DISMISSED is intentionally NOT used here — the employee
      // is not being dismissed, their probation is simply voided by the contract.
      if (!clauseIncluded) {
        // Cancel all ACTIVE / EXTENDED probation periods for this profile
        const periodsToCancel = await ProbationPeriod.findAll({
          where: { profile_id, status: { [Op.in]: ['ACTIVE', 'EXTENDED'] } },
          attributes: ['period_id'],
          transaction: t,
        });

        if (periodsToCancel.length > 0) {
          const periodIds = periodsToCancel.map((p) => p.period_id);

          await ProbationPeriod.update(
            { status: 'CANCELLED', updated_at: new Date() },
            { where: { period_id: { [Op.in]: periodIds } }, transaction: t }
          );

          // Cancel any PENDING or OVERDUE checkpoints linked to those periods.
          // COMPLETED checkpoints (and their scores) are intentionally preserved
          // for audit and historical reporting purposes.
          await EvaluationCheckpoint.update(
            { status: 'CANCELLED' },
            {
              where: {
                period_id: { [Op.in]: periodIds },
                status:    { [Op.in]: ['PENDING', 'OVERDUE'] },
              },
              transaction: t,
            }
          );
        }

        // Set employment_status to PERMANENT (also set by enforceProbationClause
        // middleware on req.body, but that only affects the body — the profile
        // record must be updated explicitly here, inside the transaction).
        await EmployeeProfile.update(
          { employment_status: 'PERMANENT' },
          { where: { profile_id }, transaction: t }
        );
      }

      return created;
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'CREATE_CONTRACT',
      description: `Contract created for profile_id ${profile_id} by HR user ${req.user.user_id}. Probation clause included: ${clauseIncluded}. Contract type: ${contract_type}.`,
    });

    return res.status(201).json({ success: true, message: 'Contract created.', data: contract });
  } catch (err) {
    console.error('[contractController.createContract]', err);
    return res.status(500).json({ success: false, message: 'Failed to create contract.' });
  }
};

// =============================================================================
// PATCH /api/contracts/:contractId/sign  (NEW_EMPLOYEE)
// Records the employee's digital signature and sets signed_at to today.
// Captures the client IP address at the time of signing for audit purposes.
// =============================================================================
const signContract = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { signature_string, signature_timestamp } = req.body;

    if (!signature_string || !signature_string.trim()) {
      return res.status(400).json({ success: false, message: 'signature_string is required.' });
    }

    const contract = await Contract.findByPk(contractId);
    if (!contract) {
      return res.status(404).json({ success: false, message: 'Contract not found.' });
    }

    // Ensure the contract belongs to the requesting employee
    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
    });

    if (!profile || profile.profile_id !== contract.profile_id) {
      return res.status(403).json({ success: false, message: 'You do not have permission to sign this contract.' });
    }

    if (contract.signed_at) {
      return res.status(409).json({ success: false, message: 'This contract has already been signed.' });
    }

    const signingDate = signature_timestamp
      ? new Date(signature_timestamp).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Capture client IP for audit record (proxy-aware)
    const clientIp =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    await contract.update({
      signed_at:        signingDate,
      signature_string: signature_string.trim(),
      updated_at:       new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'SIGN_CONTRACT',
      description: `Contract ${contractId} signed digitally. Signature: "${signature_string.trim()}". Client IP: ${clientIp}. Timestamp: ${signingDate}.`,
      ipAddress:   clientIp,
    });

    return res.json({
      success: true,
      message: 'Contract signed successfully.',
      data:    { contract_id: contract.contract_id, signed_at: signingDate },
    });
  } catch (err) {
    console.error('[contractController.signContract]', err);
    return res.status(500).json({ success: false, message: 'Failed to record signature.' });
  }
};

module.exports = { getMyContract, getContractByProfile, createContract, signContract };
