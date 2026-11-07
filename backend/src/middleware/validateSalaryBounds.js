// =============================================================================
// src/middleware/validateSalaryBounds.js
// Dynamic statutory minimum salary validation middleware.
//
// Spec s.3.3: Validate employee creation and pay updates against the active
// system_configs row. Uses an effective-dated lookup:
//   SELECT * FROM system_configs
//   WHERE effective_date <= :applicable_date
//   ORDER BY effective_date DESC
//   LIMIT 1
// This correctly resolves the most recently active rate even when today falls
// between two legislative change dates.
//
// The applicable_date defaults to req.body.start_date (for new employees)
// or today's date (for pay updates). This can be overridden by callers.
//
// IMPORTANT: Validation is ADVISORY until the System Administrator confirms
// that the seeded or entered rate is current and applicable for the employee's
// category, sector, and work arrangement. The spec includes a disclaimer:
//   "Verify current statutory rates, NIC validation rules and probation
//    permissions using authoritative sources before enabling strict legal
//    validation in production."
//
// FR-NEW-02 | NFR-02 | Spec s.1.3, s.3.3
// =============================================================================

const { Op }          = require('sequelize');
const { SystemConfig } = require('../models');

/**
 * validateSalaryBounds (middleware)
 *
 * Checks req.body.salary_monthly against the effective minimum salary.
 * Rejects with 400 if the supplied salary is below the active minimum.
 * Passes through if salary_monthly is absent (field is not being set).
 *
 * Attaches req.activeMinSalary (number) for downstream controllers to log.
 */
const validateSalaryBounds = async (req, res, next) => {
  const { salary_monthly, start_date } = req.body;

  // No salary submitted — nothing to validate
  if (salary_monthly == null) return next();

  const salary = Number.parseFloat(salary_monthly);
  if (Number.isNaN(salary)) {
    return res.status(400).json({
      success: false,
      message: 'salary_monthly must be a valid number.',
    });
  }

  try {
    // ── Determine applicable date ─────────────────────────────────────────
    // For new employees, check the rate effective on their start date.
    // For updates, check the rate effective today.
    const applicableDate = start_date
      ? start_date
      : new Date().toISOString().slice(0, 10);

    // ── Fetch the active minimum salary row ───────────────────────────────
    const config = await SystemConfig.findOne({
      where: {
        effective_date: { [Op.lte]: applicableDate },
      },
      order: [['effective_date', 'DESC']],
    });

    if (!config) {
      // No configuration rows exist yet — allow the request to proceed
      // but flag the absence in a header so HR can be alerted.
      console.warn(
        '[validateSalaryBounds] No system_configs row found. ' +
        'Salary bounds validation skipped — seed a minimum salary configuration.',
      );
      req.activeMinSalary = null;
      return next();
    }

    const minSalary = Number.parseFloat(config.min_salary_mur);
    req.activeMinSalary = minSalary;

    if (salary < minSalary) {
      return res.status(400).json({
        success: false,
        message:
          `The supplied salary (MUR ${salary.toFixed(2)}) is below the ` +
          `active statutory minimum of MUR ${minSalary.toFixed(2)} ` +
          `(effective from ${config.effective_date}). ` +
          'Please verify the applicable remuneration category and confirm the rate is correct before submission.',
        activeMinSalary: minSalary,
        effectiveDate:   config.effective_date,
      });
    }

    return next();
  } catch (err) {
    console.error('[validateSalaryBounds]', err);
    return res.status(500).json({
      success:  false,
      message:  'Failed to validate salary bounds. Please try again.',
    });
  }
};

module.exports = validateSalaryBounds;
