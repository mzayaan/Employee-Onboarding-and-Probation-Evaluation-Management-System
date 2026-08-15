// =============================================================================
// src/utils/scoringHelpers.js
// Pure scoring helper functions for probation evaluation.
// No database calls, no side effects — exported separately so unit tests can
// import these functions without pulling in the Sequelize model chain.
//
// FR-14 (weighted score calculation) | FR-15 (final recommendation logic)
// Objective 2 (Probation Evaluation Management)
// Objective 3 (Automated Recommendation)
// =============================================================================

/**
 * Calculate weighted contribution for a single evaluation criterion score.
 *
 * Formula: (rawScore / 5.0) * weightPercent
 * - rawScore   : integer 1–5 (manager or self-assessment rating)
 * - weightPercent : percentage assigned to this criterion (e.g. 25 for 25%)
 *
 * Returns a float rounded to 2 decimal places.
 *
 * @param {number} rawScore      Score on the 1–5 scale
 * @param {number} weightPercent Criterion weight as a percentage (1–100)
 * @returns {number}
 */
const calcContribution = (rawScore, weightPercent) =>
  parseFloat(((rawScore / 5.0) * parseFloat(weightPercent)).toFixed(2));

/**
 * Derive a final probation recommendation from a cumulative weighted score.
 *
 * Thresholds (based on project requirement FR-15):
 *   >= 75  → 'CONFIRM'  (confirm employment)
 *   >= 50  → 'EXTEND'   (extend probation period)
 *   < 50   → 'DISMISS'  (recommend dismissal)
 *
 * @param {number} score Cumulative weighted score (0–100)
 * @returns {'CONFIRM'|'EXTEND'|'DISMISS'}
 */
const deriveRecommendation = (score) => {
  if (score >= 75) return 'CONFIRM';
  if (score >= 50) return 'EXTEND';
  return 'DISMISS';
};

module.exports = { calcContribution, deriveRecommendation };
