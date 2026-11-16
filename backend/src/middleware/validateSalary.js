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
// Effective-date reference point
// ──────────────────────────────
// When options.referenceDateField is set (e.g. 'start_date'), the
// middleware uses max(today, req.body[referenceDateField]) as the
// reference date for the SystemConfig lookup.  This ensures that a
// future minimum wage that becomes effective before the employee's
// start date is applied at the time of creation rather than overlooked.
//
// For salary updates (PUT /employees/:id/profile), no referenceDateField
// is passed and the reference date is always today — only the minimum
// that is currently in force is applied.
//
// If referenceDateField is set but its value in req.body is absent,
// invalid, or not in the future, today is used as a safe fallback.
//
// Usage:
//   const validateSalary = require('../middleware/validateSalary');
//
//   // employee creation — uses start_date as reference when in the future
//   router.post('/', authorize('HR_ADMIN'), uploadImage.single(...),
//               validateNIC, validateProbationDuration,
//               validateSalary('salary_monthly', { referenceDateField: 'start_date' }),
//               createEmployee);
//
//   // employee update  — always uses today
//   router.put('/:id/profile', authorize('HR_ADMIN'),
//              validateSalary(), updateEmployeeProfile);
//
//   // contract route — validates req.body.basic_salary_mur (uses today)
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
 * @param {{ referenceDateField?: string }} [options={}]
 *   referenceDateField — when set, the middleware picks the later of today
 *   and req.body[referenceDateField] as the effective-date reference point
 *   for the SystemConfig minimum-salary lookup.  Omit for update routes
 *   where only today's minimum is relevant.
 * @returns {import('express').RequestHandler}
 */
const validateSalary = (fieldName = 'salary_monthly', options = {}) => async (req, res, next) => {
  const { referenceDateField } = options;
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
  // Find the most recent SystemConfig row whose effective_date is <= referenceDate.
  // • No row found (null config):  minimum check is skipped; proceed (next()).
  // • Row found, value below min:  400 Bad Request.
  // • SystemConfig read throws:    500 Server Error — a present salary field
  //   cannot be validated and the request must not proceed blindly.
  //
  // referenceDate = max(today, req.body[referenceDateField])
  //   • For new employee creation (referenceDateField = 'start_date') this
  //     means a future minimum that takes effect before the employee's start
  //     date is applied.  If start_date is absent, invalid or in the past,
  //     today is used as the safe fallback.
  //   • For updates (referenceDateField omitted) today is always used.
  try {
    const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    let referenceDate = today;
    if (referenceDateField) {
      const raw = req.body[referenceDateField];
      // Accept only 'YYYY-MM-DD' strings that are strictly in the future
      if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw > today) {
        referenceDate = raw;
      }
    }

    const config = await SystemConfig.findOne({
      where: { effective_date: { [Op.lte]: referenceDate } },
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
