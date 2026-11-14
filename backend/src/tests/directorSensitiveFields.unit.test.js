// =============================================================================
// src/tests/directorSensitiveFields.unit.test.js
//
// Regression tests for DPA-2017 sensitive field stripping on recommendation
// list endpoints exposed to LINE_MANAGER and DIRECTOR roles.
//
// Issue: listPendingDirector, listAllRecommendations (DIRECTOR), and
//        listMyRecommendations returned nested nic_number, bank_account_number
//        and salary_monthly even though getRecommendation already stripped them.
//
// FR-15, FR-20 | NFR-03 | Objective 3
// =============================================================================

jest.mock('../models');

// stripSensitiveFromRecs is a pure function that only depends on the imported
// SENSITIVE_FIELDS array from employeeController.  We mock the models import
// (required transitively) but do NOT mock employeeController so we get the
// real SENSITIVE_FIELDS list.
const { stripSensitiveFromRecs } = require('../controllers/directorController');

// The exact fields that must be absent for DIRECTOR / LINE_MANAGER (DPA-2017)
const SENSITIVE_FIELDS = [
  'nic_number',
  'tax_account_number',
  'bank_account_number',
  'bank_name',
  'passport_number',
  'salary_monthly',
  'previous_salary_monthly',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Build a minimal mock rec with a nested employeeProfile that contains
 * both sensitive and non-sensitive fields.
 */
const makeMockRec = (overrides = {}) => ({
  rec_id:              1,
  recommendation_type: 'CONFIRM',
  approval_status:     'PENDING_DIRECTOR',
  probationPeriod: {
    period_id: 10,
    employeeProfile: {
      profile_id:              5,
      job_title:               'Software Engineer',
      // All 7 sensitive fields
      nic_number:              'NIC-SECRET-001',
      tax_account_number:      'TAX-SECRET-001',
      bank_account_number:     'BANK-SECRET-001',
      bank_name:               'BankOfMauritius',
      passport_number:         'PASS-SECRET-001',
      salary_monthly:          85000,
      previous_salary_monthly: 75000,
      // Non-sensitive
      user: { first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com' },
    },
  },
  // toJSON mimics Sequelize behaviour
  toJSON() { const { toJSON, ...plain } = this; return JSON.parse(JSON.stringify(plain)); },
  ...overrides,
});

// ---------------------------------------------------------------------------
// TC-DPA-001: all 7 sensitive fields are removed
// ---------------------------------------------------------------------------
describe('stripSensitiveFromRecs', () => {
  it('TC-DPA-001: removes all SENSITIVE_FIELDS from nested employeeProfile', () => {
    const recs = [makeMockRec()];
    const result = stripSensitiveFromRecs(recs);

    const profile = result[0].probationPeriod.employeeProfile;
    SENSITIVE_FIELDS.forEach((field) => {
      expect(profile).not.toHaveProperty(field);
    });
  });

  // TC-DPA-002: non-sensitive fields survive stripping
  it('TC-DPA-002: preserves non-sensitive fields (job_title, user, profile_id)', () => {
    const recs   = [makeMockRec()];
    const result = stripSensitiveFromRecs(recs);
    const profile = result[0].probationPeriod.employeeProfile;

    expect(profile.profile_id).toBe(5);
    expect(profile.job_title).toBe('Software Engineer');
    expect(profile.user.first_name).toBe('Alice');
  });

  // TC-DPA-003: rec-level fields (recommendation_type, approval_status) survive
  it('TC-DPA-003: preserves top-level recommendation fields unchanged', () => {
    const recs   = [makeMockRec()];
    const result = stripSensitiveFromRecs(recs);

    expect(result[0].rec_id).toBe(1);
    expect(result[0].recommendation_type).toBe('CONFIRM');
    expect(result[0].approval_status).toBe('PENDING_DIRECTOR');
  });

  // TC-DPA-004: handles a rec with no nested probationPeriod gracefully
  it('TC-DPA-004: does not throw when probationPeriod is absent', () => {
    const recs = [{ rec_id: 2, toJSON() { return { rec_id: 2 }; } }];
    expect(() => stripSensitiveFromRecs(recs)).not.toThrow();
    expect(stripSensitiveFromRecs(recs)[0].rec_id).toBe(2);
  });

  // TC-DPA-005: handles a rec with no nested employeeProfile gracefully
  it('TC-DPA-005: does not throw when employeeProfile is absent', () => {
    const recs = [{
      rec_id: 3,
      probationPeriod: { period_id: 99 },
      toJSON() { const { toJSON, ...plain } = this; return JSON.parse(JSON.stringify(plain)); },
    }];
    expect(() => stripSensitiveFromRecs(recs)).not.toThrow();
    expect(stripSensitiveFromRecs(recs)[0].probationPeriod.period_id).toBe(99);
  });

  // TC-DPA-006: handles plain objects (no toJSON) produced by earlier serialisation
  it('TC-DPA-006: works on plain objects that have no toJSON method', () => {
    const recs = [{
      rec_id: 4,
      probationPeriod: {
        employeeProfile: {
          profile_id:          6,
          nic_number:          'NIC-PLAIN',
          bank_account_number: 'BANK-PLAIN',
          salary_monthly:      90000,
          job_title:           'HR Manager',
        },
      },
      // No toJSON method
    }];
    const result = stripSensitiveFromRecs(recs);
    const profile = result[0].probationPeriod.employeeProfile;

    expect(profile).not.toHaveProperty('nic_number');
    expect(profile).not.toHaveProperty('bank_account_number');
    expect(profile).not.toHaveProperty('salary_monthly');
    expect(profile.job_title).toBe('HR Manager');
  });

  // TC-DPA-007: processes an array of multiple recs, strips from each
  it('TC-DPA-007: strips from every rec in a multi-item array', () => {
    const recs = [makeMockRec({ rec_id: 10 }), makeMockRec({ rec_id: 11 })];
    const result = stripSensitiveFromRecs(recs);

    result.forEach((r) => {
      SENSITIVE_FIELDS.forEach((f) => {
        expect(r.probationPeriod.employeeProfile).not.toHaveProperty(f);
      });
    });
    expect(result).toHaveLength(2);
  });
});
