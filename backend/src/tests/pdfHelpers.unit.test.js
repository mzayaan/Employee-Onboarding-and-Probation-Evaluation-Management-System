// =============================================================================
// src/tests/pdfHelpers.unit.test.js
//
// Regression tests for the three pure helper functions in src/utils/pdfHelpers.
// These tests pin the exact bugs reported:
//   G42-CYCLE-ISO — PDF mixes approval cycles (Issue 2)
//   G09-WEIGHT    — PDF uses first-checkpoint weight for every row (Issue 3)
//
// FR-14, FR-15, FR-16 | Objective 3
// =============================================================================

const {
  filterCheckpointsByCycle,
  buildCriteriaMap,
  calcCriteriaWeightedScores,
} = require('../utils/pdfHelpers');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeCheckpoint = (id, dayNumber, status, completedAt, scores = []) => ({
  checkpoint_id: id,
  day_number:    dayNumber,
  status,
  completed_at:  completedAt,
  managerEvaluation: { scores },
});

const makeScore = (criterionId, name, rawScore, weightAtScoring, currentWeight) => ({
  criterion_id:              criterionId,
  raw_score:                 rawScore,
  weight_percent_at_scoring: weightAtScoring,
  criterion: { name, weight_percent: currentWeight },
});

// ---------------------------------------------------------------------------
// filterCheckpointsByCycle
// ---------------------------------------------------------------------------
describe('filterCheckpointsByCycle', () => {
  const cp30 = makeCheckpoint(1, 30,  'COMPLETED', '2026-01-30T12:00:00.000Z');
  const cp60 = makeCheckpoint(2, 60,  'COMPLETED', '2026-03-01T12:00:00.000Z');
  const cp90 = makeCheckpoint(3, 90,  'PENDING',   null);
  const cp120 = makeCheckpoint(4, 120, 'COMPLETED', '2026-05-01T12:00:00.000Z');

  // TC-PDF-001: checkpoints after the cycle boundary are excluded
  it('TC-PDF-001: excludes COMPLETED checkpoints whose completed_at is after cycleDecisionAt', () => {
    const cycleDecisionAt = new Date('2026-03-15T00:00:00.000Z');
    // cp30 (Jan 30) and cp60 (Mar 1) are before the boundary;
    // cp120 (May 1) is after and must be excluded.
    const result = filterCheckpointsByCycle([cp30, cp60, cp90, cp120], cycleDecisionAt);
    expect(result.map((c) => c.checkpoint_id)).toEqual([1, 2]);
  });

  // TC-PDF-002: checkpoints on or before the boundary are included
  it('TC-PDF-002: includes COMPLETED checkpoints with completed_at equal to cycleDecisionAt', () => {
    const cycleDecisionAt = new Date('2026-03-01T12:00:00.000Z');
    const result = filterCheckpointsByCycle([cp30, cp60], cycleDecisionAt);
    expect(result.map((c) => c.checkpoint_id)).toEqual([1, 2]);
  });

  // TC-PDF-003: null cycleDecisionAt = include all COMPLETED (first cycle, no extension)
  it('TC-PDF-003: null cycleDecisionAt includes all COMPLETED checkpoints', () => {
    const result = filterCheckpointsByCycle([cp30, cp60, cp90, cp120], null);
    // cp90 is PENDING so excluded; cp30, cp60, cp120 are COMPLETED
    expect(result.map((c) => c.checkpoint_id)).toEqual([1, 2, 4]);
  });

  // TC-PDF-004: PENDING checkpoints are always excluded regardless of boundary
  it('TC-PDF-004: PENDING checkpoints are always excluded', () => {
    const result = filterCheckpointsByCycle([cp30, cp90], null);
    expect(result.map((c) => c.checkpoint_id)).toEqual([1]);
  });

  // TC-PDF-005: empty input → empty output
  it('TC-PDF-005: returns empty array for empty input', () => {
    expect(filterCheckpointsByCycle([], null)).toEqual([]);
    expect(filterCheckpointsByCycle([], new Date())).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildCriteriaMap
// ---------------------------------------------------------------------------
describe('buildCriteriaMap', () => {
  // TC-PDF-006: each checkpoint stores its own { raw_score, weight } entry
  it('TC-PDF-006: stores per-checkpoint { raw_score, weight } in cpScores', () => {
    // Checkpoint 1: Performance weight = 30 (at scoring), raw = 4
    // Checkpoint 2: Performance weight = 40 (changed), raw = 3
    const cp1Scores = [makeScore(1, 'Performance', 4, 30, 30)];
    const cp2Scores = [makeScore(1, 'Performance', 3, 40, 40)];
    const cp1 = makeCheckpoint(10, 30, 'COMPLETED', '2026-01-30T00:00:00Z', cp1Scores);
    const cp2 = makeCheckpoint(20, 60, 'COMPLETED', '2026-03-01T00:00:00Z', cp2Scores);

    const map = buildCriteriaMap([cp1, cp2]);

    expect(map['Performance']).toBeDefined();
    // cpScores for checkpoint 10 should have weight = 30
    expect(map['Performance'].cpScores[10]).toEqual({ raw_score: 4, weight: 30 });
    // cpScores for checkpoint 20 should have weight = 40 (changed weight)
    expect(map['Performance'].cpScores[20]).toEqual({ raw_score: 3, weight: 40 });
    // The displayed weight should be the most recent (40)
    expect(map['Performance'].weight).toBe(40);
  });

  // TC-PDF-007: multiple criteria are keyed independently
  it('TC-PDF-007: maps multiple criteria independently', () => {
    const scores = [
      makeScore(1, 'Performance', 4, 30, 30),
      makeScore(2, 'Attendance',  5, 20, 20),
    ];
    const cp = makeCheckpoint(10, 30, 'COMPLETED', '2026-01-30T00:00:00Z', scores);
    const map = buildCriteriaMap([cp]);

    expect(Object.keys(map)).toHaveLength(2);
    expect(map['Attendance'].cpScores[10]).toEqual({ raw_score: 5, weight: 20 });
  });

  // TC-PDF-008: falls back to criterion.weight_percent when snapshot is absent
  it('TC-PDF-008: falls back to criterion.weight_percent when weight_percent_at_scoring is null', () => {
    const score = {
      criterion_id: 1,
      raw_score:    4,
      weight_percent_at_scoring: null,
      criterion: { name: 'Teamwork', weight_percent: 25 },
    };
    const cp = makeCheckpoint(10, 30, 'COMPLETED', '2026-01-30T00:00:00Z', [score]);
    const map = buildCriteriaMap([cp]);
    expect(map['Teamwork'].cpScores[10].weight).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// calcCriteriaWeightedScores
// ---------------------------------------------------------------------------
describe('calcCriteriaWeightedScores', () => {
  // TC-PDF-009: uniform weights — weighted column should total cumulative score
  it('TC-PDF-009: uniform weights produce weighted scores consistent with cumulative total', () => {
    // Single criterion, two checkpoints, same weight (30 %)
    // CP1: raw=4, weight=30  → contribution = (4/5)*30 = 24
    // CP2: raw=3, weight=30  → contribution = (3/5)*30 = 18
    // weightedScore = (24 + 18) / 2 = 21
    const criteriaList = [{
      name: 'Performance',
      criterion_id: 1,
      weight: 30,
      cpScores: {
        10: { raw_score: 4, weight: 30 },
        20: { raw_score: 3, weight: 30 },
      },
    }];
    const completedCps = [
      { checkpoint_id: 10 },
      { checkpoint_id: 20 },
    ];

    calcCriteriaWeightedScores(criteriaList, completedCps, []);

    expect(criteriaList[0].weightedScore).toBeCloseTo(21, 5);
  });

  // TC-PDF-010: changing weights — each checkpoint uses its own weight
  // This is the exact regression from the bug report:
  //   The weighted rows totalled 60 while the cumulative total showed 84.
  //   Root cause: first checkpoint's weight (30 %) was used for all checkpoints
  //   instead of using each checkpoint's own snapshot weight.
  it('TC-PDF-010: G09-WEIGHT regression — uses per-checkpoint weight, not first-checkpoint weight', () => {
    // CP1: raw=4, weight=30 → contribution = (4/5)*30 = 24
    // CP2: raw=4, weight=50 → contribution = (4/5)*50 = 40
    // Correct weightedScore = (24 + 40) / 2 = 32
    // Old (buggy) formula: avgRaw=4; weightedScore = (4/5)*30 = 24  (wrong — used CP1 weight)
    const criteriaList = [{
      name: 'Performance',
      criterion_id: 1,
      weight: 50, // most recent
      cpScores: {
        10: { raw_score: 4, weight: 30 },
        20: { raw_score: 4, weight: 50 },
      },
    }];
    const completedCps = [
      { checkpoint_id: 10 },
      { checkpoint_id: 20 },
    ];

    calcCriteriaWeightedScores(criteriaList, completedCps, []);

    // Correct per-checkpoint result = 32 (not 24 from the old formula)
    expect(criteriaList[0].weightedScore).toBeCloseTo(32, 5);
    // Confirm the old result is NOT returned
    expect(criteriaList[0].weightedScore).not.toBeCloseTo(24, 1);
  });

  // TC-PDF-011: missing checkpoint entry → treated as no contribution (null filtered out)
  it('TC-PDF-011: missing cpScores entry for a checkpoint does not throw', () => {
    const criteriaList = [{
      name: 'Attendance',
      criterion_id: 2,
      weight: 20,
      cpScores: {
        10: { raw_score: 5, weight: 20 },
        // checkpoint 20 is missing for this criterion
      },
    }];
    const completedCps = [
      { checkpoint_id: 10 },
      { checkpoint_id: 20 },
    ];

    expect(() => calcCriteriaWeightedScores(criteriaList, completedCps, [])).not.toThrow();
    // Only cp10 contributes: (5/5)*20 = 20; average over 1 contribution = 20
    expect(criteriaList[0].weightedScore).toBeCloseTo(20, 5);
  });

  // TC-PDF-012: sets lastRaw from the last checkpoint's manager scores
  it('TC-PDF-012: sets lastRaw from lastMgrScores by criterion_id', () => {
    const criteriaList = [{
      name: 'Teamwork',
      criterion_id: 3,
      weight: 20,
      cpScores: { 10: { raw_score: 3, weight: 20 } },
    }];
    const lastMgrScores = [
      { criterion_id: 3, raw_score: '3.5', criterion: { name: 'Teamwork' } },
    ];

    calcCriteriaWeightedScores(criteriaList, [{ checkpoint_id: 10 }], lastMgrScores);

    expect(criteriaList[0].lastRaw).toBe(3.5);
  });

  // TC-PDF-013: null weightedScore when no checkpoint has a score for the criterion
  it('TC-PDF-013: weightedScore is null when no completed checkpoints have this criterion', () => {
    const criteriaList = [{
      name: 'Policy',
      criterion_id: 4,
      weight: 10,
      cpScores: {}, // no entries
    }];
    calcCriteriaWeightedScores(criteriaList, [{ checkpoint_id: 10 }], []);
    expect(criteriaList[0].weightedScore).toBeNull();
  });
});
