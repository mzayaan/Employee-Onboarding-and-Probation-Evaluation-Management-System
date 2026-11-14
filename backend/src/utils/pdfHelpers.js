// =============================================================================
// src/utils/pdfHelpers.js
//
// Pure helper functions extracted from pdfController.js so that the core
// PDF calculation logic can be unit-tested in isolation.
//
// FR-14, FR-15, FR-16 | Objective 3
// =============================================================================

/**
 * Filter an array of EvaluationCheckpoint records to those that belong to
 * the approved recommendation cycle identified by cycleDecisionAt.
 *
 * Problem this solves (G42-CYCLE-ISO):
 *   When cycle 1 is APPROVED (e.g. EXTEND) and cycle 2 checkpoints have been
 *   completed but cycle 2 is still PENDING, calling generateReport for cycle 1
 *   must NOT include cycle 2's completed checkpoints in the data.  The Director
 *   decision timestamp is the natural cycle boundary: any checkpoint completed
 *   after the Director approved cycle 1 belongs to cycle 2.
 *
 * @param {Array}      checkpoints     All checkpoints sorted by day_number ASC
 * @param {Date|null}  cycleDecisionAt Director decision timestamp (null = no filter)
 * @returns {Array} COMPLETED checkpoints with completed_at ≤ cycleDecisionAt
 */
function filterCheckpointsByCycle(checkpoints, cycleDecisionAt) {
  return checkpoints.filter((cp) => {
    if (cp.status !== 'COMPLETED') return false;
    // No boundary → include all completed checkpoints (first-cycle or no extension).
    if (!cycleDecisionAt) return true;
    // Exclude checkpoints completed after the Director approved this cycle.
    if (cp.completed_at && new Date(cp.completed_at) > cycleDecisionAt) return false;
    return true;
  });
}

/**
 * Build a criteria cross-tab map from an array of COMPLETED checkpoints.
 *
 * Returns a plain object keyed by criterion name:
 *   {
 *     name:         string,
 *     criterion_id: number,
 *     weight:       number,   // most-recent snapshot weight (for display)
 *     cpScores:     { [checkpoint_id]: { raw_score: number, weight: number } }
 *   }
 *
 * Storing { raw_score, weight } per checkpoint (instead of only raw_score)
 * allows calcCriteriaWeightedScores() to apply the correct weight snapshot for
 * each checkpoint, which is necessary when weights change between evaluation
 * rounds (G09 — weight_percent_at_scoring regression, FR-14).
 *
 * @param {Array} completedCps  COMPLETED checkpoints with managerEvaluation.scores
 * @returns {Object} criteriaMap keyed by criterion name
 */
function buildCriteriaMap(completedCps) {
  const criteriaMap = {};

  completedCps.forEach((cp) => {
    (cp.managerEvaluation?.scores || []).forEach((s) => {
      const name = s.criterion?.name ?? `Criterion ${s.criterion_id}`;
      // G09: prefer the snapshot weight captured at submission time.
      const snapshotWeight = Number.parseFloat(
        s.weight_percent_at_scoring ?? s.criterion?.weight_percent ?? 0
      );

      if (!criteriaMap[name]) {
        criteriaMap[name] = {
          name,
          // Updated on each iteration — ends up as the most recent checkpoint's weight.
          weight:       snapshotWeight,
          criterion_id: s.criterion_id,
          cpScores:     {},
        };
      } else {
        // Keep the most-recent snapshot weight for the display column.
        criteriaMap[name].weight = snapshotWeight;
      }

      // Store BOTH raw_score AND the per-checkpoint weight so the weighted
      // contribution can be calculated with the correct snapshot later.
      criteriaMap[name].cpScores[cp.checkpoint_id] = {
        raw_score: Number.parseFloat(s.raw_score),
        weight:    snapshotWeight,
      };
    });
  });

  return criteriaMap;
}

/**
 * Calculate the per-criterion weighted score using per-checkpoint weight
 * snapshots, then set c.weightedScore and c.lastRaw on each criterion entry.
 *
 * Formula per criterion:
 *   weightedScore = average over completedCps of  (raw_score / 5) × checkpoint_weight
 *
 * This matches evaluationController's weighted_score calculation exactly, so
 * the PDF criteria rows and the cumulative total footer are always consistent
 * (FR-14).  Previously the code reused the first checkpoint's weight for every
 * checkpoint, causing the per-criterion rows to total a different value from
 * the cumulative footer when weights had changed between checkpoints.
 *
 * Also sets c.lastRaw from the final checkpoint for the Manager vs
 * Self-Assessment comparison section of the PDF.
 *
 * @param {Array} criteriaList   Array from Object.values(criteriaMap)
 * @param {Array} completedCps   COMPLETED checkpoints (same set map was built from)
 * @param {Array} lastMgrScores  Scores from the last completed checkpoint
 * @returns {void} Mutates criteriaList entries in place (adds weightedScore, lastRaw)
 */
function calcCriteriaWeightedScores(criteriaList, completedCps, lastMgrScores) {
  criteriaList.forEach((c) => {
    // lastRaw: manager's raw score on the final checkpoint (comparison section).
    const lastS = (lastMgrScores || []).find(
      (s) => s.criterion_id === c.criterion_id || s.criterion?.name === c.name
    );
    c.lastRaw = lastS ? Number.parseFloat(lastS.raw_score) : null;

    // Per-checkpoint weighted contribution: (raw_score / 5) × checkpoint_weight.
    // Using the per-checkpoint weight snapshot means a criterion whose weight
    // changed from 20 % to 30 % between checkpoints contributes correctly from
    // each checkpoint rather than always using the first (or last) weight.
    const cpContributions = completedCps
      .map((cp) => {
        const entry = c.cpScores[cp.checkpoint_id];
        if (!entry) return null;
        return (entry.raw_score / 5) * entry.weight;
      })
      .filter((v) => v != null);

    c.weightedScore = cpContributions.length > 0
      ? cpContributions.reduce((a, b) => a + b, 0) / cpContributions.length
      : null;
  });
}

module.exports = {
  filterCheckpointsByCycle,
  buildCriteriaMap,
  calcCriteriaWeightedScores,
};
