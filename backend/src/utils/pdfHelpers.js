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
      // G09-FIX Fix 3: prefer the frozen name snapshot so that a criterion rename
      // after submission does not change the label shown in this PDF.
      const name = s.name_at_scoring ?? s.criterion?.name ?? `Criterion ${s.criterion_id}`;
      // G09-FIX Fix 3 (legacy): prefer the snapshot weight captured at submission
      // time.  For pre-G09 rows where weight_percent_at_scoring is NULL, do NOT
      // attempt to recover the original weight via (contribution × 5) / raw_score —
      // that inversion is unreliable on rounded decimals (e.g. 68.74 % and 31.26 %
      // both map to the same rounded contribution at 1 dp, so the inverse gives
      // 68.75 % and 31.25 % — different values).  Fall back to the current criterion
      // weight for rendering and mark the entry as weight-unresolvable so calling
      // code can annotate it in the PDF (FR-14).
      let snapshotWeight;
      let weightUnresolvable = false;
      if (s.weight_percent_at_scoring != null) {
        snapshotWeight = Number.parseFloat(s.weight_percent_at_scoring);
      } else {
        // weight_percent_at_scoring is NULL — pre-G09 row.
        // Fall back to current criterion weight for rendering; flag as unresolvable.
        snapshotWeight     = Number.parseFloat(s.criterion?.weight_percent ?? 0);
        weightUnresolvable = true;
      }

      if (!criteriaMap[name]) {
        criteriaMap[name] = {
          name,
          // Updated on each iteration — ends up as the most recent checkpoint's weight.
          weight:             snapshotWeight,
          criterion_id:       s.criterion_id,
          cpScores:           {},
          weightUnresolvable: weightUnresolvable,
        };
      } else {
        // Keep the most-recent snapshot weight for the display column.
        criteriaMap[name].weight = snapshotWeight;
        // Propagate the flag: once any checkpoint has an unresolvable weight
        // the criterion is marked across all checkpoints.
        if (weightUnresolvable) criteriaMap[name].weightUnresolvable = true;
      }

      // Store raw_score, the per-checkpoint weight, and the original
      // weighted_contribution (if present) so the PDF renderer can use the
      // stored contribution directly for pre-G09 rows where the original
      // weight cannot be reliably recovered (G09 — avoids presenting the
      // current weight as a historical fact, FR-14).
      criteriaMap[name].cpScores[cp.checkpoint_id] = {
        raw_score:            Number.parseFloat(s.raw_score),
        weight:               snapshotWeight,
        weightUnresolvable:   weightUnresolvable,
        weighted_contribution: s.weighted_contribution != null
          ? Number.parseFloat(s.weighted_contribution)
          : null,
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

    // G09-EDGE: if any completed checkpoint evaluated this criterion but has BOTH
    // an unresolvable weight AND a missing stored contribution, the aggregate is
    // unknown — it cannot be partially averaged.  This case is distinct from a
    // criterion genuinely absent from a checkpoint (entry == null), where the
    // full-denominator average is intentional and the absent checkpoint simply
    // contributes 0.  When an unresolvable gap exists, mark the criterion null so
    // the PDF renderer shows "—" rather than a figure derived only from the known
    // checkpoint(s), which would implicitly divide by fewer than all checkpoints.
    const hasUnresolvableGap = completedCps.some((cp) => {
      const entry = c.cpScores[cp.checkpoint_id];
      return entry != null && entry.weightUnresolvable && entry.weighted_contribution == null;
    });
    if (hasUnresolvableGap) {
      c.weightedScore = null;
      return;
    }

    const cpContributions = completedCps
      .map((cp) => {
        const entry = c.cpScores[cp.checkpoint_id];
        if (!entry) return null;
        // G09: for pre-G09 rows where the original weight is unresolvable,
        // use the stored weighted_contribution directly when available.
        // This prevents the current (post-change) weight being applied
        // retroactively to historical scores, which would misrepresent the
        // recorded outcome (e.g. stored 50/10 becoming 64/20 = 84 instead of 60).
        // When BOTH the weight AND the contribution are unavailable the breakdown
        // is entirely unknown — return null so the PDF renderer can mark that
        // criterion as "Unavailable" rather than substituting current-weight
        // recalculation as a historical fact (G09, FR-14).
        if (entry.weightUnresolvable) {
          return entry.weighted_contribution != null ? entry.weighted_contribution : null;
        }
        return (entry.raw_score / 5) * entry.weight;
      })
      .filter((v) => v != null);

    // G09-FIX denominator: divide by the TOTAL number of completed checkpoints,
    // not only the checkpoints where this criterion appeared.  This keeps
    // sum(c.weightedScore) == cumulativeScore even when a criterion was added
    // or removed between checkpoints (FR-14).
    // Example: criterion only in cp2 of 2 checkpoints contributes 50/2 = 25,
    // not 50/1 = 50, so the per-criterion rows still sum to the cumulative footer.
    c.weightedScore = completedCps.length > 0 && cpContributions.length > 0
      ? cpContributions.reduce((a, b) => a + b, 0) / completedCps.length
      : null;
  });
}

// ── PDF rendering decision helpers ────────────────────────────────────────────
//
// These pure functions mirror the inline conditional expressions in
// pdfController.js Section 1 so that the display logic can be unit-tested
// directly without invoking PDFKit (TC-RGR-013, TC-RGR-014, TC-RGR-015).
//
// FR-14, FR-16 | G09

/** Format value for a toFixed(1) score column. */
const _fmtScore = (v) => Number.parseFloat(v).toFixed(1);

/**
 * WT column label — 'Unavail.' when the original weight cannot be established
 * (pre-G09 NULL weight_percent_at_scoring), or 'NN%' when known.
 * @param {{ weight: number, weightUnresolvable: boolean }} c
 */
function formatWtLabel(c) {
  return c.weightUnresolvable
    ? 'Unavail.'
    : `${Number.parseFloat(c.weight).toFixed(0)}%`;
}

/**
 * WGT column text:
 *   • Resolved weight, score available → 'XX.X/NN'  (score / weight denominator)
 *   • Unresolvable weight, score available → 'XX.X'  (no denominator — current weight
 *     is not the historical weight so appending it would be misleading)
 *   • Score null → '—'
 * @param {{ weight: number, weightUnresolvable: boolean, weightedScore: number|null }} c
 */
function formatWgtText(c) {
  if (c.weightedScore != null) {
    return c.weightUnresolvable
      ? _fmtScore(c.weightedScore)
      : `${_fmtScore(c.weightedScore)}/${Number.parseFloat(c.weight).toFixed(0)}`;
  }
  return '—';
}

/**
 * Returns true when the progress bar should be drawn for this criterion.
 * Skipped for unresolvable rows because a bar scaled against the current weight
 * would be misleading when that weight may not match the historical weight.
 * Returns false when no meaningful bar can be drawn — either because the
 * weight record is unresolvable or because the aggregate weighted score is
 * null (e.g. a gap in the contribution history prevents a valid average).
 *
 * @param {{ weightUnresolvable: boolean, weightedScore: number|null }} c
 */
function shouldRenderProgressBar(c) {
  return !c.weightUnresolvable && c.weightedScore != null;
}

module.exports = {
  filterCheckpointsByCycle,
  buildCriteriaMap,
  calcCriteriaWeightedScores,
  formatWtLabel,
  formatWgtText,
  shouldRenderProgressBar,
};
