// =============================================================================
// src/tests/g11SensitiveFields.unit.test.js
//
// Controller-level regression tests for G11 sensitive-field exposure fix.
// Covers the two endpoints confirmed as missing SENSITIVE_FIELDS stripping:
//
//   getCheckpoint (evaluationController.js)
//     TC-G11-001  LINE_MANAGER response omits all 7 sensitive profile fields
//     TC-G11-002  LINE_MANAGER response preserves non-sensitive profile fields
//     TC-G11-003  DIRECTOR response omits all 7 sensitive profile fields
//     TC-G11-004  HR_ADMIN response retains all sensitive profile fields
//     TC-G11-005  NEW_EMPLOYEE (own record) retains all sensitive profile fields
//     TC-G11-006  Missing probationPeriod does not cause a crash
//
//   createReview / getReviewsByProfile / getReviewById / updateReview
//   (developmentReviewController.js)
//     TC-G11-011  LINE_MANAGER createReview response omits sensitive fields
//     TC-G11-012  LINE_MANAGER getReviewsByProfile response omits sensitive fields
//     TC-G11-013  LINE_MANAGER getReviewById response omits sensitive fields
//     TC-G11-014  LINE_MANAGER updateReview response omits sensitive fields
//     TC-G11-015  HR_ADMIN getReviewById response retains sensitive fields
//     TC-G11-016  Preserved non-sensitive fields in dev-review response
//
// NFR-02 | NFR-03 | NFR-08 | DPA-2017
// =============================================================================

// bcrypt is compiled for Windows — it cannot load in this Linux sandbox.
// Mock it before any controller module is required so the native .node file
// is never touched.  The mock is safe: bcrypt is never called in unit tests.
jest.mock('bcrypt', () => ({
  hash:    jest.fn().mockResolvedValue('$hashed'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('$salt'),
}));
// cloudinary is used in employeeController at module load time
jest.mock('cloudinary', () => ({ v2: { uploader: { upload: jest.fn() }, config: jest.fn() } }));
// nodemailer
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));
// multer
jest.mock('multer', () => {
  const m = jest.fn(() => ({ single: jest.fn(() => (req, res, next) => next()) }));
  m.memoryStorage = jest.fn();
  return m;
});

jest.mock('../models');
jest.mock('../utils/auditLogger',    () => ({ createAuditLog:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

const models = require('../models');
const { getCheckpoint }                                              = require('../controllers/evaluationController');
const { createReview, getReviewsByProfile, getReviewById, updateReview } = require('../controllers/developmentReviewController');

// ─── Shared constants ─────────────────────────────────────────────────────────

const ALL_SENSITIVE_FIELDS = [
  'nic_number',
  'tax_account_number',
  'bank_account_number',
  'bank_name',
  'passport_number',
  'salary_monthly',
  'previous_salary_monthly',
];

// ─── Shared fixture builders ──────────────────────────────────────────────────

/** Full EmployeeProfile plain object including all 7 sensitive fields. */
const makeProfilePlain = (profileId = 10, userId = 100, managerId = 42) => ({
  profile_id:              profileId,
  job_title:               'Software Engineer',
  manager_id:              managerId,
  user_id:                 userId,
  employment_status:       'ON_PROBATION',
  // Sensitive fields — must be absent from restricted-role responses
  nic_number:              `NIC-${profileId}`,
  tax_account_number:      `TAX-${profileId}`,
  bank_account_number:     `BANK-${profileId}`,
  bank_name:               'BankOfMauritius',
  passport_number:         `PASS-${profileId}`,
  salary_monthly:          85000,
  previous_salary_monthly: 72000,
  // Non-sensitive
  user:    { user_id: userId, first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com' },
  manager: { user_id: managerId, first_name: 'Bob', last_name: 'Jones' },
});

/**
 * Build a minimal checkpoint mock whose toJSON() returns a plain object
 * containing a nested probationPeriod.employeeProfile.
 */
const makeCheckpointMock = (profilePlain) => {
  const plain = {
    checkpoint_id:    1,
    checkpoint_label: '30 Day',
    due_date:         '2026-11-30',
    probationPeriod: {
      period_id:       5,
      profile_id:      profilePlain.profile_id,
      start_date:      '2026-10-01',
      status:          'ACTIVE',
      employeeProfile: { ...profilePlain },
      checkpoints:     [],
    },
    managerEvaluation: null,
    selfAssessment:    null,
  };
  return {
    ...plain,
    toJSON() { return JSON.parse(JSON.stringify(plain)); },
  };
};

/** Build minimal Express-like req object. */
const makeReq = (role, userId = 42, body = {}, params = {}) => ({
  user: { user_id: userId, role, first_name: 'Manager', last_name: 'User' },
  body,
  params,
});

/** Build jest-spied res object. */
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ─── getCheckpoint tests ──────────────────────────────────────────────────────

describe('getCheckpoint — G11 sensitive field stripping', () => {
  const profilePlain = makeProfilePlain(10, 100, 42);

  beforeEach(() => {
    jest.clearAllMocks();

    // Modify properties on the existing auto-mock objects (not replace them).
    // The controller destructures models at require-time, so the references
    // must point to the SAME objects throughout.
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(
      makeCheckpointMock(profilePlain)
    );
    models.EvaluationCriterion.findAll = jest.fn().mockResolvedValue([]);

    // AttendanceRecord may or may not be on the auto-mock; guard before assigning
    if (!models.AttendanceRecord) models.AttendanceRecord = {};
    models.AttendanceRecord.findAll = jest.fn().mockResolvedValue([]);
  });

  it('TC-G11-001: LINE_MANAGER response omits all 7 sensitive profile fields', async () => {
    const req = makeReq('LINE_MANAGER', 42, {}, { checkpointId: '1' });
    const res = makeRes();

    await getCheckpoint(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];
    const ep = data.probationPeriod?.employeeProfile;
    expect(ep).toBeDefined();
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(ep).not.toHaveProperty(field);
    });
  });

  it('TC-G11-002: LINE_MANAGER response preserves non-sensitive profile fields', async () => {
    const req = makeReq('LINE_MANAGER', 42, {}, { checkpointId: '1' });
    const res = makeRes();

    await getCheckpoint(req, res);

    const { data } = res.json.mock.calls[0][0];
    const ep = data.probationPeriod?.employeeProfile;
    expect(ep.profile_id).toBe(10);
    expect(ep.job_title).toBe('Software Engineer');
    expect(ep.user.first_name).toBe('Alice');
  });

  it('TC-G11-003: DIRECTOR response omits all 7 sensitive profile fields', async () => {
    const req = makeReq('DIRECTOR', 99, {}, { checkpointId: '1' });
    const res = makeRes();

    await getCheckpoint(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];
    const ep = data.probationPeriod?.employeeProfile;
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(ep).not.toHaveProperty(field);
    });
  });

  it('TC-G11-004: HR_ADMIN response retains all 7 sensitive profile fields', async () => {
    const req = makeReq('HR_ADMIN', 1, {}, { checkpointId: '1' });
    const res = makeRes();

    await getCheckpoint(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];
    const ep = data.probationPeriod?.employeeProfile;
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(ep).toHaveProperty(field);
    });
  });

  it('TC-G11-005: NEW_EMPLOYEE viewing own checkpoint retains all sensitive profile fields', async () => {
    // The employee's user_id (100) matches employeeProfile.user_id (100)
    const req = makeReq('NEW_EMPLOYEE', 100, {}, { checkpointId: '1' });
    const res = makeRes();

    await getCheckpoint(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];
    const ep = data.probationPeriod?.employeeProfile;
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(ep).toHaveProperty(field);
    });
  });

  it('TC-G11-006: absent probationPeriod does not cause a crash', async () => {
    // Checkpoint with no nested probationPeriod
    const slim = { checkpoint_id: 2, toJSON() { return { checkpoint_id: 2 }; } };
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(slim);

    const req = makeReq('LINE_MANAGER', 42, {}, { checkpointId: '2' });
    const res = makeRes();

    // The access check will fail (no probationPeriod.employeeProfile.manager_id)
    // but no unhandled exception should be thrown.
    await expect(getCheckpoint(req, res)).resolves.not.toThrow();
  });
});

// ─── developmentReviewController tests ───────────────────────────────────────

/** Build a DevelopmentReview mock with a nested employeeProfile. */
const makeReviewMock = (profilePlain) => {
  const plain = {
    review_id:                7,
    profile_id:               profilePlain.profile_id,
    reviewed_by:              42,
    employee_acknowledgement: false,
    employeeProfile:          { ...profilePlain },
    reviewer: { user_id: 42, first_name: 'Manager', last_name: 'User', role: 'LINE_MANAGER' },
    checkpoint: null,
  };
  return {
    ...plain,
    toJSON() { return JSON.parse(JSON.stringify(plain)); },
  };
};

describe('developmentReviewController — G11 sensitive field stripping', () => {
  const profilePlain = makeProfilePlain(10, 100, 42);

  beforeEach(() => {
    jest.clearAllMocks();

    const reviewMock = makeReviewMock(profilePlain);

    // Mutate properties on the existing auto-mock objects
    models.DevelopmentReview.create   = jest.fn().mockResolvedValue({ review_id: 7, profile_id: 10 });
    models.DevelopmentReview.findByPk = jest.fn().mockResolvedValue(reviewMock);
    models.DevelopmentReview.findAll  = jest.fn().mockResolvedValue([reviewMock]);

    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: 10,
      manager_id: 42,
      user_id:    100,
    });
    models.EmployeeProfile.findOne = jest.fn().mockResolvedValue(null);
  });

  it('TC-G11-011: LINE_MANAGER createReview response omits all 7 sensitive fields', async () => {
    const req = makeReq('LINE_MANAGER', 42, { profile_id: 10 }, {});
    const res = makeRes();

    await createReview(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const { data } = res.json.mock.calls[0][0];
    const ep = data.employeeProfile;
    expect(ep).toBeDefined();
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(ep).not.toHaveProperty(field);
    });
  });

  it('TC-G11-012: LINE_MANAGER getReviewsByProfile response omits all 7 sensitive fields', async () => {
    const req = {
      user:   { user_id: 42, role: 'LINE_MANAGER' },
      params: { profileId: '10' },
    };
    const res = makeRes();

    await getReviewsByProfile(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];
    expect(Array.isArray(data)).toBe(true);
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(data[0].employeeProfile).not.toHaveProperty(field);
    });
  });

  it('TC-G11-013: LINE_MANAGER getReviewById response omits all 7 sensitive fields', async () => {
    const req = {
      user:   { user_id: 42, role: 'LINE_MANAGER' },
      params: { reviewId: '7' },
    };
    const res = makeRes();

    await getReviewById(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(data.employeeProfile).not.toHaveProperty(field);
    });
  });

  it('TC-G11-014: LINE_MANAGER updateReview response omits all 7 sensitive fields', async () => {
    const reviewBase = { review_id: 7, profile_id: 10, reviewed_by: 42 };
    // findByPk called twice: once for the base record, once for the refreshed response
    models.DevelopmentReview.findByPk = jest.fn()
      .mockResolvedValueOnce({ ...reviewBase, update: jest.fn().mockResolvedValue(undefined) })
      .mockResolvedValueOnce(makeReviewMock(profilePlain));

    const req = {
      user:   { user_id: 42, role: 'LINE_MANAGER' },
      params: { reviewId: '7' },
      body:   { work_life_balance_rating: 4 },
    };
    const res = makeRes();

    await updateReview(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(data.employeeProfile).not.toHaveProperty(field);
    });
  });

  it('TC-G11-015: HR_ADMIN getReviewById response retains all 7 sensitive fields', async () => {
    const req = {
      user:   { user_id: 1, role: 'HR_ADMIN' },
      params: { reviewId: '7' },
    };
    const res = makeRes();

    await getReviewById(req, res);

    const { data } = res.json.mock.calls[0][0];
    ALL_SENSITIVE_FIELDS.forEach((field) => {
      expect(data.employeeProfile).toHaveProperty(field);
    });
  });

  it('TC-G11-016: non-sensitive fields survive stripping in dev-review response', async () => {
    const req = {
      user:   { user_id: 42, role: 'LINE_MANAGER' },
      params: { reviewId: '7' },
    };
    const res = makeRes();

    await getReviewById(req, res);

    const { data } = res.json.mock.calls[0][0];
    const ep = data.employeeProfile;
    expect(ep.profile_id).toBe(10);
    expect(ep.job_title).toBe('Software Engineer');
    expect(ep.user.first_name).toBe('Alice');
  });
});
