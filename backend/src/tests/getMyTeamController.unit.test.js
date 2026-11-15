// =============================================================================
// src/tests/getMyTeamController.unit.test.js
//
// Controller-level regression tests for the getMyTeam bug (commit 9f54e16).
// These tests call the ACTUAL getMyTeam function with mocked Express req/res
// and mocked Sequelize models, verifying the sensitive-field fix is applied
// inside the controller itself — not just in the extracted helper.
//
//   TC-RGR-011  HIGH  — getMyTeam response omits all 7 SENSITIVE_FIELDS
//   TC-RGR-012  HIGH  — getMyTeam response preserves non-sensitive fields
//   TC-RGR-013  MEDIUM — getMyTeam returns 500 when the database query throws
//
// NFR-03 | NFR-08 | DPA-2017
// =============================================================================

jest.mock('../models');

const models = require('../models');

// Pull in the actual controller function (not a local simulation).
const { getMyTeam } = require('../controllers/evaluationController');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const ALL_SENSITIVE_FIELDS = [
  'nic_number',
  'tax_account_number',
  'bank_account_number',
  'bank_name',
  'passport_number',
  'salary_monthly',
  'previous_salary_monthly',
];

/** Build a minimal Sequelize-like profile mock with all 7 sensitive fields. */
const makeProfile = (profileId) => {
  const plain = {
    profile_id:              profileId,
    job_title:               'Software Engineer',
    department_id:           1,
    manager_id:              42,
    // All 7 DPA-sensitive fields — must be absent from the response
    nic_number:              `NIC-${profileId}`,
    tax_account_number:      `TAX-${profileId}`,
    bank_account_number:     `BANK-${profileId}`,
    bank_name:               'BankOfMauritius',
    passport_number:         `PASS-${profileId}`,
    salary_monthly:          80000,
    previous_salary_monthly: 72000,
    // Non-sensitive associations
    user: { user_id: profileId + 100, first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com', role: 'NEW_EMPLOYEE' },
    probationPeriods: [],
  };
  return { ...plain, toJSON() { return { ...plain }; } };
};

/** Build minimal Express-like mock req for a LINE_MANAGER. */
const makeReq = (userId = 42) => ({ user: { user_id: userId, role: 'LINE_MANAGER' } });

/** Build a jest-spied Express-like res object. */
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('getMyTeam (actual controller) — DPA-2017 sensitive field stripping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // TC-RGR-011: the actual getMyTeam handler strips all 7 SENSITIVE_FIELDS
  it('TC-RGR-011: response payload omits all 7 SENSITIVE_FIELDS for every profile', async () => {
    const profiles = [makeProfile(1), makeProfile(2)];

    // Wire the EmployeeProfile mock that getMyTeam uses internally
    models.EmployeeProfile.findAll = jest.fn().mockResolvedValue(profiles);

    const req = makeReq();
    const res = makeRes();

    await getMyTeam(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];

    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);

    data.forEach((profile) => {
      ALL_SENSITIVE_FIELDS.forEach((field) => {
        expect(profile).not.toHaveProperty(field);
      });
    });
  });

  // TC-RGR-012: non-sensitive fields survive the strip — job title and user block intact
  it('TC-RGR-012: non-sensitive fields (profile_id, job_title, user) are preserved in the response', async () => {
    const profiles = [makeProfile(5)];
    models.EmployeeProfile.findAll = jest.fn().mockResolvedValue(profiles);

    const req = makeReq();
    const res = makeRes();

    await getMyTeam(req, res);

    const { success, data } = res.json.mock.calls[0][0];

    expect(success).toBe(true);
    expect(data[0].profile_id).toBe(5);
    expect(data[0].job_title).toBe('Software Engineer');
    expect(data[0].user.first_name).toBe('Alice');
    expect(Array.isArray(data[0].probationPeriods)).toBe(true);
  });

  // TC-RGR-013: a thrown database error produces a 500 response (no crash, no leak)
  it('TC-RGR-013: database error produces HTTP 500 and does not expose stack trace in body', async () => {
    models.EmployeeProfile.findAll = jest.fn().mockRejectedValue(new Error('DB connection lost'));

    const req = makeReq();
    const res = makeRes();

    await getMyTeam(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    // The error message field must not expose the raw DB error string
    expect(body.message).not.toMatch(/DB connection lost/i);
  });
});
