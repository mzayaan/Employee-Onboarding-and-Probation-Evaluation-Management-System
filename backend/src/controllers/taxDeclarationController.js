// =============================================================================
// src/controllers/taxDeclarationController.js
// Handles MRA Employee Declaration Form (EDF) submissions.
//
// Employees submit their PAYE category (A–G) once; subsequent submissions
// upsert the existing record (one active declaration per employee).
//
// FR-NEW-02 | NFR-08 | Objective 1 (extended)
// =============================================================================

const { TaxDeclaration, EmployeeProfile } = require('../models');
const { createAuditLog }                  = require('../utils/auditLogger');

// =============================================================================
// GET /api/tax-declarations/mine  (NEW_EMPLOYEE)
// Returns the current MRA EDF declaration for the authenticated employee.
// Returns 404 (not an error) if no declaration has been submitted yet.
// =============================================================================
const getMyTaxDeclaration = async (req, res) => {
  try {
    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
    });

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const declaration = await TaxDeclaration.findOne({
      where: { profile_id: profile.profile_id },
    });

    // 404 is expected when the employee has not yet submitted — frontend handles this gracefully
    if (!declaration) {
      return res.status(404).json({ success: false, message: 'No tax declaration found.' });
    }

    return res.json({ success: true, data: declaration });
  } catch (err) {
    console.error('[taxDeclarationController.getMyTaxDeclaration]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve tax declaration.' });
  }
};

// =============================================================================
// POST /api/tax-declarations  (NEW_EMPLOYEE)
// Creates or replaces the employee's MRA EDF declaration.
// UNIQUE constraint on profile_id means only one row is stored; this handler
// uses upsert behaviour: destroy existing and insert fresh (simpler than
// Sequelize upsert on ENUM columns across MySQL versions).
// =============================================================================
const submitTaxDeclaration = async (req, res) => {
  try {
    const {
      declaration_category,
      num_dependants,
      spouse_employed,
      declaration_date,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    const validCategories = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    if (!declaration_category || !validCategories.includes(declaration_category)) {
      return res.status(400).json({
        success: false,
        message: `declaration_category must be one of: ${validCategories.join(', ')}.`,
      });
    }

    if (!declaration_date) {
      return res.status(400).json({ success: false, message: 'declaration_date is required.' });
    }

    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
    });

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // ── Upsert: delete existing declaration and recreate ────────────────────
    await TaxDeclaration.destroy({ where: { profile_id: profile.profile_id } });

    const declaration = await TaxDeclaration.create({
      profile_id:           profile.profile_id,
      declaration_category,
      num_dependants:       num_dependants != null ? Number.parseInt(num_dependants, 10) : 0,
      spouse_employed:      spouse_employed !== false && spouse_employed !== 'false',
      declaration_date,
      created_at:           new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'SUBMIT_TAX_DECLARATION',
      description: `MRA EDF declaration submitted. Category: ${declaration_category}. Profile: ${profile.profile_id}.`,
    });

    return res.status(201).json({
      success: true,
      message: 'Tax declaration submitted successfully.',
      data:    declaration,
    });
  } catch (err) {
    console.error('[taxDeclarationController.submitTaxDeclaration]', err);
    return res.status(500).json({ success: false, message: 'Failed to submit tax declaration.' });
  }
};

module.exports = { getMyTaxDeclaration, submitTaxDeclaration };
