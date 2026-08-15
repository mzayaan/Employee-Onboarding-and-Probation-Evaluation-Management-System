// =============================================================================
// src/tests/evaluation.unit.test.js
// Unit tests for the pure scoring helper functions.
//
// calcContribution and deriveRecommendation live in src/utils/scoringHelpers.js —
// a pure utility module with no database calls, HTTP logic, or side effects.
// No mocking is required.  They are the algorithmic core of FR-14 (weighted
// score calculation) and FR-15 (final recommendation logic).
//
// Objectives tested: Objective 2 (Probation Evaluation Management),
//                    Objective 3 (Automated PDF Reporting and Recommendation)
// Requirements: FR-14, FR-15
// =============================================================================

const { calcContribution, deriveRecommendation } = require('../utils/scoringHelpers');

// =============================================================================
// calcContribution(rawScore, weightPercent)
// Formula: (rawScore / 5.0) * weightPercent
// Returns a float rounded to 2 decimal places.
// =============================================================================

describe('calcContribution — weighted score calculation (FR-14)', () => {

  // --- Typical inputs --------------------------------------------------------

  test('TC-EVAL-001: perfect score on a 20% criterion → 20.00', () => {
    // (5 / 5.0) * 20 = 20.00
    expect(calcContribution(5, 20)).toBe(20.00);
  });

  test('TC-EVAL-002: score of 4 on a 25% criterion → 20.00', () => {
    // (4 / 5.0) * 25 = 20.00
    expect(calcContribution(4, 25)).toBe(20.00);
  });

  test('TC-EVAL-003: score of 3 on a 30% criterion → 18.00', () => {
    // (3 / 5.0) * 30 = 18.00
    expect(calcContribution(3, 30)).toBe(18.00);
  });

  test('TC-EVAL-004: score of 2 on a 15% criterion → 6.00', () => {
    // (2 / 5.0) * 15 = 6.00
    expect(calcContribution(2, 15)).toBe(6.00);
  });

  test('TC-EVAL-005: score of 1 on a 10% criterion → 2.00', () => {
    // (1 / 5.0) * 10 = 2.00
    expect(calcContribution(1, 10)).toBe(2.00);
  });

  // --- Boundary / edge cases -------------------------------------------------

  test('TC-EVAL-006: raw score of 0 returns 0.00 (no contribution)', () => {
    expect(calcContribution(0, 20)).toBe(0.00);
  });

  test('TC-EVAL-007: weight of 0 returns 0.00', () => {
    expect(calcContribution(5, 0)).toBe(0.00);
  });

  test('TC-EVAL-008: perfect score on a 100% criterion → 100.00', () => {
    // Single criterion carrying full weight
    expect(calcContribution(5, 100)).toBe(100.00);
  });

  test('TC-EVAL-009: result is rounded to 2 decimal places', () => {
    // (1 / 5.0) * 3 = 0.60  — exact, but confirms rounding logic
    const result = calcContribution(1, 3);
    expect(Number(result.toFixed(2))).toBe(result);
  });

  test('TC-EVAL-010: fractional weight produces correct contribution', () => {
    // (5 / 5.0) * 33.33 = 33.33
    expect(calcContribution(5, 33.33)).toBe(33.33);
  });

});

// =============================================================================
// deriveRecommendation(score)
// >= 75  → 'CONFIRM'
// >= 50  → 'EXTEND'
// < 50   → 'DISMISS'
// =============================================================================

describe('deriveRecommendation — final probation recommendation (FR-15)', () => {

  // --- CONFIRM threshold (>= 75) --------------------------------------------

  test('TC-REC-001: score 75 → CONFIRM (lower boundary)', () => {
    expect(deriveRecommendation(75)).toBe('CONFIRM');
  });

  test('TC-REC-002: score 80 → CONFIRM', () => {
    expect(deriveRecommendation(80)).toBe('CONFIRM');
  });

  test('TC-REC-003: score 100 → CONFIRM (maximum possible)', () => {
    expect(deriveRecommendation(100)).toBe('CONFIRM');
  });

  test('TC-REC-004: score 75.01 → CONFIRM (just above boundary)', () => {
    expect(deriveRecommendation(75.01)).toBe('CONFIRM');
  });

  // --- EXTEND threshold (50 to 74.99) --------------------------------------

  test('TC-REC-005: score 74.99 → EXTEND (just below CONFIRM threshold)', () => {
    expect(deriveRecommendation(74.99)).toBe('EXTEND');
  });

  test('TC-REC-006: score 60 → EXTEND (midpoint)', () => {
    expect(deriveRecommendation(60)).toBe('EXTEND');
  });

  test('TC-REC-007: score 50 → EXTEND (lower boundary)', () => {
    expect(deriveRecommendation(50)).toBe('EXTEND');
  });

  test('TC-REC-008: score 50.01 → EXTEND (just above lower boundary)', () => {
    expect(deriveRecommendation(50.01)).toBe('EXTEND');
  });

  // --- DISMISS threshold (< 50) --------------------------------------------

  test('TC-REC-009: score 49.99 → DISMISS (just below EXTEND threshold)', () => {
    expect(deriveRecommendation(49.99)).toBe('DISMISS');
  });

  test('TC-REC-010: score 25 → DISMISS', () => {
    expect(deriveRecommendation(25)).toBe('DISMISS');
  });

  test('TC-REC-011: score 0 → DISMISS (minimum)', () => {
    expect(deriveRecommendation(0)).toBe('DISMISS');
  });

  // --- Return type ----------------------------------------------------------

  test('TC-REC-012: returns a string value', () => {
    expect(typeof deriveRecommendation(80)).toBe('string');
    expect(typeof deriveRecommendation(60)).toBe('string');
    expect(typeof deriveRecommendation(30)).toBe('string');
  });

  // --- All possible return values -------------------------------------------

  test('TC-REC-013: only valid return values are CONFIRM, EXTEND, DISMISS', () => {
    const validValues = ['CONFIRM', 'EXTEND', 'DISMISS'];
    const testScores  = [0, 25, 49.99, 50, 60, 74.99, 75, 90, 100];
    testScores.forEach((score) => {
      expect(validValues).toContain(deriveRecommendation(score));
    });
  });

});
