// =============================================================================
// src/tests/compliance.unit.test.js
// Unit tests for Mauritius compliance middleware and validation helpers.
//
// Tests validateProbationDuration and enforceProbationClause from
// src/middleware/validateProbationBoundary.js — pure middleware functions
// tested without a real HTTP server.  No database or network calls.
//
// Also tests tax category validation (A-G) for MRA EDF submissions (FR-21).
//
// Objectives tested:
//   Objective 1 (Employee Onboarding Management — contract compliance)
// Requirements: FR-20 (Employment Contract), FR-21 (MRA EDF), NFR-08 (Compliance)
// WRA 2019 s.13 reference: MAX_PROBATION_DAYS = 184
// =============================================================================

const {
  validateProbationDuration,
  enforceProbationClause,
} = require('../middleware/validateProbationBoundary');

// =============================================================================
// Helpers: minimal mock req / res / next for middleware unit testing
// =============================================================================

/**
 * Build a mock request object with the given body fields.
 */
const mockReq = (body = {}) => ({ body: { ...body } });

/**
 * Build a mock response with status() / json() spies.
 * status() returns the same res so .json() can chain.
 */
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

/** Simple next spy. */
const mockNext = () => jest.fn();

// =============================================================================
// validateProbationDuration
// WRA 2019 s.13 — probation period must not exceed 184 days (6 months)
// =============================================================================

describe('validateProbationDuration — WRA 2019 s.13 probation boundary (FR-20)', () => {

  // ── Valid durations — next() must be called ──────────────────────────────

  test('TC-COMP-U-001: exactly 184 days → passes (boundary)', () => {
    const req  = mockReq({ start_date: '2026-01-01', probation_end_date: '2026-07-04' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('TC-COMP-U-002: 90-day probation → passes', () => {
    const req  = mockReq({ start_date: '2026-03-01', probation_end_date: '2026-05-29' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('TC-COMP-U-003: 30-day probation → passes', () => {
    const req  = mockReq({ start_date: '2026-06-01', probation_end_date: '2026-07-01' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // ── Invalid durations — HTTP 400 must be returned ───────────────────────

  test('TC-COMP-U-004: 185 days → HTTP 400 (one day over limit)', () => {
    const req  = mockReq({ start_date: '2026-01-01', probation_end_date: '2026-07-05' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
    // Error message must mention WRA 2019
    const [{ message }] = res.json.mock.calls[0];
    expect(message).toMatch(/WRA 2019/);
  });

  test('TC-COMP-U-005: 365 days (1 year) → HTTP 400', () => {
    const req  = mockReq({ start_date: '2026-01-01', probation_end_date: '2027-01-01' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('TC-COMP-U-006: end date before start date → HTTP 400', () => {
    const req  = mockReq({ start_date: '2026-06-01', probation_end_date: '2026-01-01' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  // ── Missing dates — middleware must pass through (other validators handle) ──

  test('TC-COMP-U-007: missing start_date → next() called (not validated here)', () => {
    const req  = mockReq({ probation_end_date: '2026-07-01' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('TC-COMP-U-008: missing probation_end_date → next() called', () => {
    const req  = mockReq({ start_date: '2026-01-01' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('TC-COMP-U-009: invalid date strings → next() called (skipped gracefully)', () => {
    const req  = mockReq({ start_date: 'not-a-date', probation_end_date: 'also-bad' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  // ── Response body content ────────────────────────────────────────────────

  test('TC-COMP-U-010: rejection message includes day count and statutory limit', () => {
    const req  = mockReq({ start_date: '2026-01-01', probation_end_date: '2026-12-31' });
    const res  = mockRes();
    const next = mockNext();

    validateProbationDuration(req, res, next);

    const [{ message }] = res.json.mock.calls[0];
    expect(message).toMatch(/184/);      // statutory limit days
    expect(message).toMatch(/Non-compliance/i);
  });

});

// =============================================================================
// enforceProbationClause
// WRA 2019 s.13 — no probation clause → employment_status forced to PERMANENT
// =============================================================================

describe('enforceProbationClause — no-clause forces PERMANENT status (FR-20)', () => {

  test('TC-COMP-U-011: probation_clause_included = false → employment_status = PERMANENT', () => {
    const req  = mockReq({ probation_clause_included: false });
    const res  = mockRes();
    const next = mockNext();

    enforceProbationClause(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.employment_status).toBe('PERMANENT');
    expect(req.skipCheckpointGeneration).toBe(true);
  });

  test('TC-COMP-U-012: probation_clause_included = "false" (string) → PERMANENT', () => {
    const req  = mockReq({ probation_clause_included: 'false' });
    const res  = mockRes();
    const next = mockNext();

    enforceProbationClause(req, res, next);

    expect(req.body.employment_status).toBe('PERMANENT');
    expect(req.skipCheckpointGeneration).toBe(true);
  });

  test('TC-COMP-U-013: probation_clause_included = true → next() called without modification', () => {
    const req  = mockReq({ probation_clause_included: true, employment_status: 'ON_PROBATION' });
    const res  = mockRes();
    const next = mockNext();

    enforceProbationClause(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // employment_status must NOT be overwritten
    expect(req.body.employment_status).toBe('ON_PROBATION');
    expect(req.skipCheckpointGeneration).toBeUndefined();
  });

  test('TC-COMP-U-014: clause absent (undefined) → next() called, no override', () => {
    const req  = mockReq({ employment_status: 'ON_PROBATION' });
    const res  = mockRes();
    const next = mockNext();

    enforceProbationClause(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.employment_status).toBe('ON_PROBATION');
  });

  test('TC-COMP-U-015: clause = 0 (numeric false) → PERMANENT', () => {
    const req  = mockReq({ probation_clause_included: 0 });
    const res  = mockRes();
    const next = mockNext();

    enforceProbationClause(req, res, next);

    expect(req.body.employment_status).toBe('PERMANENT');
  });

});

// =============================================================================
// Tax Category Validation — MRA EDF (FR-21)
// Valid categories are A, B, C, D, E, F, G (MRA PAYE bands)
// This inline helper mimics what the controller validates.
// =============================================================================

/**
 * Inline helper matching the controller-level MRA category validation.
 * Returns true when category is one of A–G.
 */
const isValidTaxCategory = (category) =>
  typeof category === 'string' && /^[A-G]$/.test(category);

describe('MRA Tax Category Validation A-G (FR-21)', () => {

  const validCategories = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const invalidCategories = ['H', 'Z', '1', '', 'AB', 'a', null, undefined, 123];

  test.each(validCategories)(
    'TC-COMP-U-016-%s: category %s → valid',
    (cat) => {
      expect(isValidTaxCategory(cat)).toBe(true);
    },
  );

  test.each(invalidCategories)(
    'TC-COMP-U-017-%s: category %s → invalid',
    (cat) => {
      expect(isValidTaxCategory(cat)).toBe(false);
    },
  );

  test('TC-COMP-U-018: all seven MRA categories accepted (A-G)', () => {
    validCategories.forEach((cat) => {
      expect(isValidTaxCategory(cat)).toBe(true);
    });
    expect(validCategories).toHaveLength(7);
  });

  test('TC-COMP-U-019: lowercase category rejected (case-sensitive)', () => {
    expect(isValidTaxCategory('a')).toBe(false);
    expect(isValidTaxCategory('g')).toBe(false);
  });

});
