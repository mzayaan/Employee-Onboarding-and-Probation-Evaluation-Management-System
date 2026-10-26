// =============================================================================
// src/controllers/contractController.js
// Handles employment contract creation, retrieval, and digital signing.
//
// WRA 2019 s.13 probation rules are enforced via the enforceProbationClause
// middleware mounted in contractRoutes.js on the POST / route.
//
// FR-04 (extended) | NFR-02, NFR-03, NFR-08 | Objective 1
// =============================================================================

const { Contract, EmployeeProfile, User } = require('../models');
const { createAuditLog }                  = require('../utils/auditLogger');

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
      probation_clause_included,
      basic_salary_mur,
      notice_period_days,
      cloudinary_url,
    } = req.body;

    if (!profile_id || !contract_type || !basic_salary_mur) {
      return res.status(400).json({
        success: false,
        message: 'profile_id, contract_type and basic_salary_mur are required.',
      });
    }

    const existing = await Contract.findOne({ where: { profile_id } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A contract already exists for this employee. Use PATCH to update it.',
      });
    }

    const contract = await Contract.create({
      profile_id,
      contract_reference:        contract_reference || null,
      contract_type,
      probation_duration_months: probation_duration_months ?? 3,
      probation_clause_included: probation_clause_included !== false,
      basic_salary_mur,
      notice_period_days:        notice_period_days ?? 14,
      cloudinary_url:            cloudinary_url || null,
      created_at:                new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'CREATE_CONTRACT',
      description: `Contract created for profile_id ${profile_id} by HR user ${req.user.user_id}.`,
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
      signed_at:  signingDate,
      updated_at: new Date(),
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
