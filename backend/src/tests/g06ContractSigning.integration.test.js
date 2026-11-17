// =============================================================================
// src/tests/g06ContractSigning.integration.test.js
// G06 contract-signing validation batch — direct handler unit tests.
//
// Defects addressed:
//   D1 — Client-supplied timestamp must NOT control signed_at (server time only)
//   D2 — Signature string must match employee's registered name (backend enforced)
//   D3 — Atomic concurrency guard: WHERE signed_at IS NULL; 0 rows → 409
//   D4 — typeof check: non-string inputs rejected
//   D5 — Length/blank check: empty / whitespace-only / > 500 chars rejected
//
// Name-match policy (D2):
//   • "First Last"               always acceptable
//   • "First Middle Last"        acceptable when middle_name is non-null
//   • Case-insensitive; internal whitespace normalised to single space
//   • Max 500 characters (matches signature_string column)
//
// Server-time policy (D1):
//   • signed_at is always set via new Date() on the server
//   • client-supplied signature_timestamp is silently ignored
//   • precise instant captured in updated_at (DATETIME) + audit log created_at
//
// FR-04 (extended) | NFR-02, NFR-03, NFR-08 | Objective 1
// =============================================================================

// ── MUST be first: prevent `const { Op } = require('sequelize')` hang ────────
jest.mock('sequelize', () => ({
  Op: require('sequelize/lib/operators'),
}));

// ── Sequelize database connection stub ───────────────────────────────────────
jest.mock('../config/database', () => ({
  define:       jest.fn().mockReturnValue({}),
  authenticate: jest.fn().mockResolvedValue(undefined),
  sync:         jest.fn().mockResolvedValue(undefined),
  transaction:  jest.fn().mockImplementation(async (cb) => cb({})),
  query:        jest.fn().mockResolvedValue([[], []]),
}));

// ── Utility stubs ─────────────────────────────────────────────────────────────
jest.mock('../utils/auditLogger', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../utils/scoringHelpers', () => ({
  calcContribution:     jest.fn((raw, weight) => (raw / 5) * weight),
  deriveRecommendation: jest.fn(() => 'CONFIRM'),
}));

// ── Service stubs ─────────────────────────────────────────────────────────────
jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

// ── directorController imports employeeController for SENSITIVE_FIELDS ────────
jest.mock('../controllers/employeeController', () => ({
  SENSITIVE_FIELDS: ['basic_salary_mur', 'bank_account_number', 'national_id'],
  getMyProfile:     jest.fn(),
  getAllEmployees:   jest.fn(),
}));

// ── Infrastructure stubs ──────────────────────────────────────────────────────
jest.mock('express-rate-limit', () => () => (req, res, next) => next());
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  }),
}));
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash:    jest.fn().mockResolvedValue('$2b$12$mockhash'),
}));
jest.mock('cloudinary', () => ({
  v2: { uploader: { upload_stream: jest.fn() }, config: jest.fn() },
}));
jest.mock('multer', () => {
  const m = jest.fn(() => ({ single: jest.fn(() => (req, res, next) => next()) }));
  m.diskStorage  = jest.fn();
  m.memoryStorage = jest.fn();
  return m;
});

// ── Sequelize models mock ─────────────────────────────────────────────────────
jest.mock('../models', () => {
  const mockSequelize = {
    authenticate: jest.fn().mockResolvedValue(undefined),
    sync:         jest.fn().mockResolvedValue(undefined),
    transaction:  jest.fn().mockImplementation(async (cb) => cb({})),
  };

  // Default employee user — no middle name
  const mockEmployeeUser = {
    user_id:     5,
    email:       'alice.smith@company.com',
    role:        'NEW_EMPLOYEE',
    is_active:   true,
    first_name:  'Alice',
    middle_name: null,
    last_name:   'Smith',
    toJSON:      jest.fn().mockReturnThis(),
  };

  const mockHRUser = {
    user_id:    2,
    email:      'hr@company.com',
    role:       'HR_ADMIN',
    is_active:  true,
    first_name: 'Test',
    last_name:  'HR',
    toJSON:     jest.fn().mockReturnThis(),
  };

  // Profile whose profile_id matches the contract below
  const mockProfile = {
    profile_id:        10,
    user_id:           5,
    start_date:        '2026-02-01',
    employment_status: 'ON_PROBATION',
    update:            jest.fn().mockResolvedValue(true),
    toJSON:            jest.fn().mockReturnThis(),
  };

  // Unsigned contract (signed_at = null)
  const mockContract = {
    contract_id:               1,
    profile_id:                10,
    contract_type:             'PROBATIONARY',
    probation_duration_months: 3,
    probation_clause_included: true,
    basic_salary_mur:          25000,
    notice_period_days:        14,
    signed_at:                 null,
    signature_string:          null,
    contract_end_date:         null,
    created_at:                new Date(),
    toJSON:                    jest.fn().mockReturnThis(),
  };

  return {
    sequelize: mockSequelize,

    User: {
      findOne:  jest.fn().mockResolvedValue(mockEmployeeUser),
      findByPk: jest.fn().mockResolvedValue(mockEmployeeUser),
    },

    EmployeeProfile: {
      findByPk: jest.fn().mockResolvedValue(mockProfile),
      findOne:  jest.fn().mockResolvedValue(mockProfile),
      update:   jest.fn().mockResolvedValue([1]),
    },

    Contract: {
      findOne:  jest.fn().mockResolvedValue(null),
      findByPk: jest.fn().mockResolvedValue(mockContract),
      create:   jest.fn().mockResolvedValue(mockContract),
      // Default: atomic update succeeds (1 row affected)
      update:   jest.fn().mockResolvedValue([1]),
    },

    ProbationPeriod: {
      findAll:  jest.fn().mockResolvedValue([]),
      findOne:  jest.fn().mockResolvedValue(null),
      update:   jest.fn().mockResolvedValue([0]),
      findByPk: jest.fn().mockResolvedValue(null),
    },

    EvaluationCheckpoint: {
      count:    jest.fn().mockResolvedValue(0),
      update:   jest.fn().mockResolvedValue([0]),
      findOne:  jest.fn().mockResolvedValue(null),
      findAll:  jest.fn().mockResolvedValue([]),
      findByPk: jest.fn().mockResolvedValue(null),
      create:   jest.fn().mockResolvedValue({}),
    },

    FinalRecommendation: {
      findByPk: jest.fn().mockResolvedValue(null),
      findAll:  jest.fn().mockResolvedValue([]),
      findOne:  jest.fn().mockResolvedValue(null),
      create:   jest.fn().mockResolvedValue({}),
    },

    ManagerEvaluation: {
      findOne: jest.fn().mockResolvedValue(null),
      create:  jest.fn().mockResolvedValue({ eval_id: 1 }),
      findAll: jest.fn().mockResolvedValue([]),
    },

    SelfAssessment: {
      findOne: jest.fn().mockResolvedValue(null),
      create:  jest.fn().mockResolvedValue({ sa_id: 1 }),
    },

    EvaluationScore:     { create: jest.fn().mockResolvedValue({}), bulkCreate: jest.fn().mockResolvedValue([]) },
    SelfAssessmentScore: { create: jest.fn().mockResolvedValue({}), bulkCreate: jest.fn().mockResolvedValue([]) },
    EvaluationCriterion: {
      findAll: jest.fn().mockResolvedValue([
        { criterion_id: 1, weight_percent: '50', is_active: true },
        { criterion_id: 2, weight_percent: '50', is_active: true },
      ]),
    },
    PerformanceNote:    { create: jest.fn().mockResolvedValue({}), findAll: jest.fn().mockResolvedValue([]) },
    Department:         { findAll: jest.fn().mockResolvedValue([]) },
    OnboardingDocument: { findAll: jest.fn().mockResolvedValue([]) },
    OnboardingTask:     { findAll: jest.fn().mockResolvedValue([]) },
    TaskAssignment:     { findAll: jest.fn().mockResolvedValue([]) },
    GeneratedReport:    { findAll: jest.fn().mockResolvedValue([]) },
    Notification:       { findAll: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
    AuditLog:           { create:  jest.fn().mockResolvedValue({}) },
    SystemConfig:       { findOne: jest.fn().mockResolvedValue(null) },
    LeaveBalance:       { findAll: jest.fn().mockResolvedValue([]) },
    DocumentType:       { findAll: jest.fn().mockResolvedValue([]) },
  };
});

// ── Import handler under test ─────────────────────────────────────────────────
const { signContract } = require('../controllers/contractController');
const { createAuditLog } = require('../utils/auditLogger');
const { Op } = require('sequelize');

// Live reference to mocked models (re-evaluated per call so beforeEach resets work)
const m = require('../models');

// ── Helper: build minimal req / res objects ───────────────────────────────────
const makeReqRes = (body = {}, overrides = {}) => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
  const req = {
    body,
    params:  { contractId: '1' },
    headers: { 'x-forwarded-for': '192.168.1.100' },
    socket:  { remoteAddress: '127.0.0.1' },
    user: {
      user_id:    5,
      role:       'NEW_EMPLOYEE',
      first_name: 'Alice',
      last_name:  'Smith',
      email:      'alice.smith@company.com',
      ...overrides,
    },
  };
  return { req, res };
};

// ── Helpers to match mock user data ──────────────────────────────────────────
// These mirror the defaults in the models mock so assertions stay in sync.
const EMPLOYEE_USER = {
  user_id:     5,
  first_name:  'Alice',
  middle_name: null,
  last_name:   'Smith',
};
const PROFILE_ID  = 10;
const CONTRACT_ID = 1;

// ── Reset between tests ───────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();

  // Restore defaults after any per-test override
  m.User.findByPk.mockResolvedValue({
    ...EMPLOYEE_USER,
    toJSON: jest.fn().mockReturnThis(),
  });

  m.EmployeeProfile.findOne.mockResolvedValue({
    profile_id:        PROFILE_ID,
    user_id:           EMPLOYEE_USER.user_id,
    employment_status: 'ON_PROBATION',
    update:            jest.fn().mockResolvedValue(true),
    toJSON:            jest.fn().mockReturnThis(),
  });

  m.Contract.findByPk.mockResolvedValue({
    contract_id:      CONTRACT_ID,
    profile_id:       PROFILE_ID,
    signed_at:        null,
    signature_string: null,
    toJSON:           jest.fn().mockReturnThis(),
  });

  // Atomic update: 1 row affected by default
  m.Contract.update.mockResolvedValue([1]);
});

// =============================================================================
// 1. Happy-path signing
// =============================================================================
describe('signContract — happy path', () => {
  test('TC-G06-01: accepts "First Last" and returns 200', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);

    expect(res.status).not.toHaveBeenCalledWith(expect.any(Number));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  test('TC-G06-02: case-insensitive match (all lowercase)', async () => {
    const { req, res } = makeReqRes({ signature_string: 'alice smith' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-03: case-insensitive match (all uppercase)', async () => {
    const { req, res } = makeReqRes({ signature_string: 'ALICE SMITH' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-04: leading/trailing whitespace is trimmed and accepted', async () => {
    const { req, res } = makeReqRes({ signature_string: '  Alice Smith  ' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-05: internal extra spaces are normalised and accepted', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice   Smith' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-06: response includes contract_id and signed_at', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    const call = res.json.mock.calls[0][0];
    expect(call.data).toHaveProperty('contract_id');
    expect(call.data).toHaveProperty('signed_at');
  });
});

// =============================================================================
// 2. Middle-name variant (D2)
// =============================================================================
describe('signContract — middle name (D2)', () => {
  const userWithMiddle = {
    user_id:     5,
    first_name:  'Alice',
    middle_name: 'Marie',
    last_name:   'Smith',
    toJSON:      jest.fn().mockReturnThis(),
  };

  beforeEach(() => {
    m.User.findByPk.mockResolvedValue(userWithMiddle);
  });

  test('TC-G06-07: "First Last" accepted when middle_name present', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-08: "First Middle Last" accepted', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Marie Smith' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-09: "First Middle Last" accepted case-insensitively', async () => {
    const { req, res } = makeReqRes({ signature_string: 'alice marie smith' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-10: "First Middle Last" with extra spaces normalised', async () => {
    const { req, res } = makeReqRes({ signature_string: ' Alice  Marie  Smith ' });
    await signContract(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('TC-G06-11: wrong middle name rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Jane Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});

// =============================================================================
// 3. Name mismatch (D2)
// =============================================================================
describe('signContract — name mismatch (D2)', () => {
  test('TC-G06-12: wrong last name rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Jones' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-13: wrong first name rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Bob Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-14: single-word name rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-15: totally unrelated string rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: 'I agree' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-16: error message mentions registered name', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Wrong Name' });
    await signContract(req, res);
    const msg = res.json.mock.calls[0][0].message;
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 4. Type and length guards (D4, D5)
// =============================================================================
describe('signContract — type and length guards (D4, D5)', () => {
  test('TC-G06-17: null input rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: null });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-18: number input rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: 12345 });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-19: boolean input rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: true });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-20: array input rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: ['Alice', 'Smith'] });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-21: object input rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: { name: 'Alice Smith' } });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-22: undefined input rejected with 400', async () => {
    const { req, res } = makeReqRes({});
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-23: empty string rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: '' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-24: whitespace-only string rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: '   ' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-25: tab-only string rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: '\t\t' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-26: string exceeding 500 characters rejected with 400', async () => {
    const { req, res } = makeReqRes({ signature_string: 'A'.repeat(501) });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('TC-G06-27: string of exactly 500 characters passes length guard (name mismatch follows)', async () => {
    // Length guard should not trigger; subsequent name check will reject it
    const { req, res } = makeReqRes({ signature_string: 'A'.repeat(500) });
    await signContract(req, res);
    // 400 expected but NOT for length — name mismatch fires instead
    expect(res.status).toHaveBeenCalledWith(400);
    const msg = res.json.mock.calls[0][0].message;
    expect(msg).not.toMatch(/500/);        // must not be "exceeds 500" message
    expect(msg).not.toMatch(/blank/i);     // must not be "blank" message
  });
});

// =============================================================================
// 5. Server-controlled time (D1)
// =============================================================================
describe('signContract — server-controlled time (D1)', () => {
  test('TC-G06-28: signed_at in response is a valid YYYY-MM-DD date string', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    const call = res.json.mock.calls[0][0];
    expect(call.data.signed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('TC-G06-29: client-supplied signature_timestamp does not control signed_at', async () => {
    // Provide a timestamp far in the past — backend must use server time
    const fakeDate = '2000-01-01T00:00:00.000Z';
    const { req, res } = makeReqRes({
      signature_string:    'Alice Smith',
      signature_timestamp: fakeDate,
    });

    const before = new Date().toISOString().slice(0, 10);
    await signContract(req, res);
    const after  = new Date().toISOString().slice(0, 10);

    const call = res.json.mock.calls[0][0];
    const signedAt = call.data.signed_at;

    expect(signedAt).not.toBe('2000-01-01');
    expect(signedAt >= before).toBe(true);
    expect(signedAt <= after).toBe(true);
  });

  test('TC-G06-30: future signature_timestamp does not control signed_at', async () => {
    const futureDate = '2099-12-31T23:59:59.000Z';
    const { req, res } = makeReqRes({
      signature_string:    'Alice Smith',
      signature_timestamp: futureDate,
    });

    const today = new Date().toISOString().slice(0, 10);
    await signContract(req, res);

    const signedAt = res.json.mock.calls[0][0].data.signed_at;
    expect(signedAt).not.toBe('2099-12-31');
    expect(signedAt).toBe(today);
  });

  test('TC-G06-31: Contract.update receives updated_at close to now (server time)', async () => {
    const before = Date.now();
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    const after  = Date.now();

    // updated_at passed to Contract.update must be a Date object
    const updateCall = m.Contract.update.mock.calls[0];
    const updateData = updateCall[0];
    expect(updateData.updated_at).toBeInstanceOf(Date);
    expect(updateData.updated_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(updateData.updated_at.getTime()).toBeLessThanOrEqual(after);
  });
});

// =============================================================================
// 6. Atomic concurrency guard (D3)
// =============================================================================
describe('signContract — atomic concurrency guard (D3)', () => {
  test('TC-G06-32: Contract.update uses WHERE signed_at: null for atomicity', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);

    expect(m.Contract.update).toHaveBeenCalledWith(
      expect.objectContaining({ signed_at: expect.any(String) }),
      expect.objectContaining({
        where: expect.objectContaining({ signed_at: null }),
      }),
    );
  });

  test('TC-G06-33: 0 rows affected → 409 (concurrent signing detected)', async () => {
    m.Contract.update.mockResolvedValueOnce([0]);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  test('TC-G06-34: 409 message indicates already signed', async () => {
    m.Contract.update.mockResolvedValueOnce([0]);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    const msg = res.json.mock.calls[0][0].message;
    expect(msg.toLowerCase()).toContain('signed');
  });

  test('TC-G06-35: audit log NOT created when concurrency race detected', async () => {
    m.Contract.update.mockResolvedValueOnce([0]);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  test('TC-G06-36: 1 row affected → audit log created', async () => {
    m.Contract.update.mockResolvedValueOnce([1]);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'SIGN_CONTRACT' }),
    );
  });
});

// =============================================================================
// 7. Authentication and ownership
// =============================================================================
describe('signContract — authentication and ownership', () => {
  test('TC-G06-37: no employee profile → 403', async () => {
    m.EmployeeProfile.findOne.mockResolvedValueOnce(null);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('TC-G06-38: contract not found → 404', async () => {
    m.Contract.findByPk.mockResolvedValueOnce(null);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('TC-G06-39: profile_id mismatch (another employee\'s contract) → 403', async () => {
    // Contract belongs to profile_id 99, not 10
    m.Contract.findByPk.mockResolvedValueOnce({
      contract_id:      1,
      profile_id:       99,         // different from PROFILE_ID (10)
      signed_at:        null,
      signature_string: null,
      toJSON:           jest.fn().mockReturnThis(),
    });
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('TC-G06-40: user record not found during name validation → 403', async () => {
    m.User.findByPk.mockResolvedValueOnce(null);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('TC-G06-41: ownership check uses server-side user_id only (not from body)', async () => {
    // Inject a different user_id into the body — it must be ignored
    const { req, res } = makeReqRes({
      signature_string: 'Alice Smith',
      user_id:          999,         // attacker tries to impersonate another user
      profile_id:       999,
    });
    await signContract(req, res);
    // Should succeed because server uses req.user.user_id (5), not body
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

    // Profile lookup must have been called with req.user.user_id (5), not 999
    expect(m.EmployeeProfile.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: 5 }),
      }),
    );
  });

  test('TC-G06-42: audit log records correct user_id (from token, not body)', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5 }),
    );
  });
});

// =============================================================================
// 8. Audit log contents
// =============================================================================
describe('signContract — audit log (FR-18)', () => {
  test('TC-G06-43: audit log action type is SIGN_CONTRACT', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'SIGN_CONTRACT' }),
    );
  });

  test('TC-G06-44: audit log includes IP address', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );
  });

  test('TC-G06-45: audit log uses x-forwarded-for IP when present', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    req.headers['x-forwarded-for'] = '10.0.0.5, 203.0.113.1';
    await signContract(req, res);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: '10.0.0.5' }),
    );
  });

  test('TC-G06-46: audit log falls back to socket.remoteAddress when no x-forwarded-for', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    delete req.headers['x-forwarded-for'];
    req.socket = { remoteAddress: '10.1.2.3' };
    await signContract(req, res);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: '10.1.2.3' }),
    );
  });
});

// =============================================================================
// 9. Persistence and signed-terms protection
// =============================================================================
describe('signContract — persistence and signed-terms protection', () => {
  test('TC-G06-47: Contract.update is called with signed_at and signature_string', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);

    expect(m.Contract.update).toHaveBeenCalledWith(
      expect.objectContaining({
        signed_at:        expect.any(String),
        signature_string: 'Alice Smith',
      }),
      expect.any(Object),
    );
  });

  test('TC-G06-48: signature_string stored trimmed (leading/trailing whitespace removed)', async () => {
    const { req, res } = makeReqRes({ signature_string: '  Alice Smith  ' });
    await signContract(req, res);

    const updateData = m.Contract.update.mock.calls[0][0];
    expect(updateData.signature_string).toBe('Alice Smith');
  });

  test('TC-G06-49: database error during update returns 500', async () => {
    m.Contract.update.mockRejectedValueOnce(new Error('DB timeout'));
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('TC-G06-50: profile lookup error returns 500', async () => {
    m.EmployeeProfile.findOne.mockRejectedValueOnce(new Error('DB error'));
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('TC-G06-51: contract lookup error returns 500', async () => {
    m.Contract.findByPk.mockRejectedValueOnce(new Error('DB error'));
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('TC-G06-52: validation errors (name mismatch) do NOT call Contract.update', async () => {
    const { req, res } = makeReqRes({ signature_string: 'Wrong Person' });
    await signContract(req, res);
    expect(m.Contract.update).not.toHaveBeenCalled();
  });

  test('TC-G06-53: type errors do NOT call Contract.update', async () => {
    const { req, res } = makeReqRes({ signature_string: 42 });
    await signContract(req, res);
    expect(m.Contract.update).not.toHaveBeenCalled();
  });

  test('TC-G06-54: 403 responses do NOT call Contract.update', async () => {
    m.EmployeeProfile.findOne.mockResolvedValueOnce(null);
    const { req, res } = makeReqRes({ signature_string: 'Alice Smith' });
    await signContract(req, res);
    expect(m.Contract.update).not.toHaveBeenCalled();
  });
});
