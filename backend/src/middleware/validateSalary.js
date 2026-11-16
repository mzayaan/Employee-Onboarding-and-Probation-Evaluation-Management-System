// =============================================================================
// src/middleware/validateSalary.js
// Validates a salary field in req.body before it is persisted.
//
// A03 — guards salary_monthly (employee create / update) and
//        basic_salary_mur (contract create) against:
//   • non-numeric / non-finite values  (NaN, Infinity, plain strings)
//   • negative amounts
//   • amounts below the effective minimum from SystemConfig
//
// No-op when the field is absent, null, or empty string — the salary
// is optional on employee creation and must not be forced to a value
// it was not given.
//
// The minimum salary is read from SystemConfig using the row whose
// effective_date is on or before today (most-recent first).  When no
// SystemConfig row is found the minimum check is silently skipped so
// that requests are never blocked solely due to a missing config entry.
//
// Usage:
//   const validateSalary = require('../middleware/validateSalary');
//
//   // employee route  — validates req.body.salary_monthly (default)
//   router.post('/', authorize('HR_ADMIN'), uploadImage.single(...),
//               validateNIC, validateProbationDuration,
//               validateSalary(), createEmployee);
//
//   // contract route — validates req.body.basic_salary_mur
//   router.post('/', authorize('HR_ADMIN'), enforceProbationClause,
//               validateSalary('basic_salary_mur'), createContract);
//
// NFR-02 | FR-04 (extended) | FR-NEW-02 | Spec s.1.3
// =============================================================================

const { SystemConfig } = require('../models');
const { Op }            = require('sequelize');

/**
 * validateSalary
 *
 * Returns Express middleware that validates one named salary field.
 *
 * @param {string} [fieldName='salary_monthly']
 *   The req.body field name to validate.  Pass 'basic_salary_mur' for the
 *   contract creation route; leave as default for employee routes.
 * @returns {import('express').RequestHandler}
 */
const validateSalary = (fieldName = 'salary_monthly') => async (req, res, next) => {
  const raw = req.body[fieldName];

  // ── No-op when field is absent, explicitly null, or empty string ───────────
  // salary_monthly is optional on employee creation; basic_salary_mur is
  // required by the contract controller, but that controller's own guard
  // handles the missing-field case with a more descriptive message.
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return next();
  }

  const value = Number(raw);

  // ── Reject non-finite values (NaN, Infinity, -Infinity, strings) ──────────
  if (!Number.isFinite(value)) {
    return res.status(400).json({
      success: false,
      message: `${fieldName} must be a valid finite number.`,
    });
  }

  // ── Reject negative amounts ───────────────────────────────────────────────
  if (value < 0) {
    return res.status(400).json({
      success: false,
      message: `${fieldName} must not be negative.`,
    });
  }

  // ── Minimum salary check from SystemConfig ────────────────────────────────
  // Find the most recent SystemConfig row whose effective_date is <= today.
  // • No row found (null config):  minimum check is skipped; proceed (next()).
  // • Row found, value below min:  400 Bad Request.
  // • SystemConfig read throws:    500 Server Error — a present salary field
  //   cannot be validated and the request must not proceed blindly.
  try {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const config = await SystemConfig.findOne({
      where: { effective_date: { [Op.lte]: today } },
      order: [['effective_date', 'DESC']],
    });

    if (config) {
      const minSalary = Number(config.min_salary_mur);
      if (Number.isFinite(minSalary) && value < minSalary) {
        return res.status(400).json({
          success: false,
          message:
            `${fieldName} of ${value} MUR is below the configured minimum of ` +
            `${minSalary} MUR (effective ${config.effective_date}).`,
        });
      }
    }
  } catch (err) {
    // A SystemConfig read failure means we cannot determine whether the
    // supplied salary meets the configured minimum.  Proceeding without
    // that check would silently bypass a business rule, so we return 500.
    console.error('[validateSalary] Failed to read SystemConfig:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Salary validation is temporarily unavailable due to a configuration read error.',
    });
  }

  next();
};

module.exports = validateSalary;
