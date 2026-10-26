// =============================================================================
// src/middleware/validateProbationBoundary.js
// WRA 2019 probation compliance guards — two independent validators.
//
//  1. validateProbationDuration
//     Rejects any employee profile creation or update where the probation
//     period exceeds the 6-month (184-day) statutory limit under WRA 2019.
//
//  2. enforceProbationClause
//     Implements WRA 2019 s.13: if a contract record is submitted with
//     probation_clause_included = false, this middleware sets
//     req.body.employment_status = 'PERMANENT' so the controller persists
//     it correctly, and attaches req.skipCheckpointGeneration = true so
//     the service layer knows not to create 30/60/90-day checkpoints.
//
// Usage:
//   const { validateProbationDuration, enforceProbationClause } = require('../middleware/validateProbationBoundary');
//
//   // On employee creation (checks dates):
//   router.post('/', authenticate, authorize('HR_ADMIN'), validateNIC, validateProbationDuration, createEmployee);
//
//   // On contract creation (enforces clause rule):
//   router.post('/contracts', authenticate, authorize('HR_ADMIN'), enforceProbationClause, createContract);
//
// NFR-02 | FR-04 (extended) | WRA 2019 s.13
// =============================================================================

const MAX_PROBATION_DAYS = 184; // 6 months statutory limit

/**
 * validateProbationDuration
 *
 * Reads start_date and probation_end_date from req.body.
 * Returns 400 if the gap exceeds MAX_PROBATION_DAYS.
 * Skipped if either date is absent (field-level validation handles that).
 */
const validateProbationDuration = (req, res, next) => {
  const { start_date, probation_end_date } = req.body;

  if (!start_date || !probation_end_date) return next();

  const start = new Date(start_date);
  const end   = new Date(probation_end_date);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return next();

  const diffMs   = end - start;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > MAX_PROBATION_DAYS) {
    return res.status(400).json({
      success: false,
      message: `Non-compliance: Probation period of ${diffDays} days exceeds the 6-month statutory maximum (${MAX_PROBATION_DAYS} days) under WRA 2019.`,
    });
  }

  if (diffDays <= 0) {
    return res.status(400).json({
      success: false,
      message: 'probation_end_date must be after start_date.',
    });
  }

  next();
};

/**
 * enforceProbationClause
 *
 * WRA 2019 s.13: a contract without a probation clause means the employee
 * is PERMANENT from day one.
 *
 * When probation_clause_included === false (or the string 'false'):
 *   - Forces req.body.employment_status = 'PERMANENT'
 *   - Sets req.skipCheckpointGeneration = true
 *     (the employee creation service must check this flag before creating
 *      30/60/90-day evaluation checkpoints)
 */
const enforceProbationClause = (req, res, next) => {
  const clauseIncluded = req.body.probation_clause_included;

  // Normalise: accept boolean false or the string 'false'
  const isExcluded =
    clauseIncluded === false ||
    clauseIncluded === 'false' ||
    clauseIncluded === 0;

  if (isExcluded) {
    req.body.employment_status   = 'PERMANENT';
    req.skipCheckpointGeneration = true;
  }

  next();
};

module.exports = { validateProbationDuration, enforceProbationClause };
