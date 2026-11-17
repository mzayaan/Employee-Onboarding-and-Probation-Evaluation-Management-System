// =============================================================================
// src/tests/g07Contract.integration.test.js
// G07 contract correctness batch — direct handler unit tests (no Supertest).
//
// Why no Supertest: require('sequelize') itself hangs in this sandbox
// (confirmed: `node -e "require('sequelize')"` exits 124 / no output).
// Multiple controllers import `const { Op } = require('sequelize')` at module
// top level, so loading app.js triggers the hang even with ../models mocked.
// The fix: mock 'sequelize' as the FIRST jest.mock (hoisted before any require),
// redirecting it to the sub-path that works, then call handlers directly.
//
// FR-04 (extended) | NFR-02, NFR-08 | WRA 2019 s.13 | Objective 1
// =============================================================================

// ── MUST be first: prevent `const { Op } = require('sequelize')` hang ────────
// require('sequelize/lib/operators') loads fine; the main entry hangs.
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
  calcContribution:    jest.fn((raw, weight) => (raw / 5) * weight),
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
  m.diskStorage = jest.fn();
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

  const mockHRUser = {
    user_id:   2,
    email:     'hr@company.com',
    role:      'HR_ADMIN',
    is_active: true,
    toJSON:    jest.fn().mockReturnThis(),
  };

  const mockProfile = {
    profile_id:        10,
    user_id:           5,
    start_date:        '2026-02-01',
    employment_status: 'ON_PROBATION',
    update:            jest.fn().mockResolvedValue(true),
    toJSON:            jest.fn().mockReturnThis(),
  };

  const mockContract = {
    contract_id:               1,
    profile_id:                10,
    contract_type:             'PROBATIONARY',
    probation_duration_months: 3,
    probation_clause_included: true,
    basic_salary_mur:          25000,
    notice_period_days:        14,
    contract_end_date:         null,
    created_at:                new Date(),
    toJSON:                    jest.fn().mockReturnThis(),
  };

  return {
    sequelize: mockSequelize,

    User: {
      findOne:  jest.fn().mockResolvedValue(mockHRUser),
      findByPk: jest.fn().mockResolvedValue(mockHRUser),
    },

    EmployeeProfile: {
      findByPk: jest.fn().mockResolvedValue(mockProfile),
      findOne:  jest.fn().mockResolvedValue(null),
      update:   jest.fn().mockResolvedValue([1]),
    },

    Contract: {
      findOne: jest.fn().mockResolvedValue(null),
      create:  jest.fn().mockResolvedValue(mockContract),
    },

    ProbationPeriod: {
      findAll:  jest.fn().mockResolvedValue([{ period_id: 7 }, { period_id: 8 }]),
      findOne:  jest.fn().mockResolvedValue(null),
      update:   jest.fn().mockResolvedValue([2]),
      findByPk: jest.fn().mockResolvedValue(null),
    },

    EvaluationCheckpoint: {
      count:   jest.fn().mockResolvedValue(0),
      update:  jest.fn().mockResolvedValue([3]),
      findOne: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),  // default: no checkpoints (new employee)
      findByPk: jest.fn().mockResolvedValue(null),
      create:  jest.fn().mockResolvedValue({}),
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

// ── Import handlers under test ────────────────────────────────────────────────
const { createContract }                                = require('../controllers/contractController');
const { submitManagerEvaluation, submitSelfAssessment } = require('../controllers/evaluationController');
const { approveRecommendation }                         = require('../controllers/directorController');

// Op is from our mock (which redirects to sequelize/lib/operators)
const { Op } = require('sequelize');

// Live reference to the mocked models (re-evaluated per call so beforeEach resets work)
const m = require('../models');

// ── Helper: build minimal req / res objects ───────────────────────────────────
const makeReqRes = (body = {}, userOverrides = {}) => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
  const req = {
    body,
    params: {},
    headers: { 'x-forwarded-for': '127.0.0.1' },
    socket:  { remoteAddress: '127.0.0.1' },
    user: {
      user_id:    2,
      role:       'HR_ADMIN',
      first_name: 'Test',
      last_name:  'HR',
      email:      'hr@company.com',
      ...userOverrides,
    },
  };
  return { req, res };
};

// Helper: extract status code and body from res mock
const getResponse = (res) => {
  const statusCode = res.status.mock.calls[0]?.[0] ?? 200;
  const body       = res.json.mock.calls[0]?.[0]   ?? {};
  return { status: statusCode, body };
};

// ── Restore default mock behaviours before each test ─────────────────────────
beforeEach(() => {
  jest.clearAllMocks();

  // Restore transaction to default pass-through
  m.sequelize.transaction.mockImplementation(async (cb) => cb({}));

  // Restore model defaults
  m.Contract.findOne.mockResolvedValue(null);
  m.Contract.create.mockResolvedValue({
    contract_id: 1, profile_id: 10, contract_type: 'PROBATIONARY',
    probation_duration_months: 3, probation_clause_included: true,
    basic_salary_mur: 25000, notice_period_days: 14,
    contract_end_date: null, created_at: new Date(),
    toJSON: jest.fn().mockReturnThis(),
  });
  m.EmployeeProfile.findByPk.mockResolvedValue({
    profile_id: 10, user_id: 5, start_date: '2026-02-01',
    employment_status: 'ON_PROBATION',
    update: jest.fn().mockResolvedValue(true),
    toJSON: jest.fn().mockReturnThis(),
  });
  m.EmployeeProfile.update.mockResolvedValue([1]);
  m.ProbationPeriod.findAll.mockResolvedValue([{ period_id: 7 }, { period_id: 8 }]);
  m.ProbationPeriod.findOne.mockResolvedValue(null); // no root period by default → no duration conflict
  m.ProbationPeriod.update.mockResolvedValue([2]);
  m.EvaluationCheckpoint.count.mockResolvedValue(0);
  m.EvaluationCheckpoint.update.mockResolvedValue([3]);
  m.EvaluationCheckpoint.findAll.mockResolvedValue([]);  // default: no checkpoints
  m.EvaluationCheckpoint.findByPk.mockResolvedValue(null);
  m.FinalRecommendation.findByPk.mockResolvedValue(null);
  m.ManagerEvaluation.findOne.mockResolvedValue(null);
  m.SelfAssessment.findOne.mockResolvedValue(null);
  m.EvaluationCriterion.findAll.mockResolvedValue([
    { criterion_id: 1, weight_percent: '50', is_active: true },
    { criterion_id: 2, weight_percent: '50', is_active: true },
  ]);
});

// =============================================================================
// G07 — Area 2: Probation-duration consistency
// =============================================================================
describe('G07 Area 2 — Probation-duration consistency', () => {

  test('TC-G07-001: fractional duration (1.5) → 400 Bad Request', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 1.5,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/whole number/i);
  });

  test('TC-G07-002: negative duration (-3) → 400 Bad Request', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: -3,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/negative/i);
  });

  test('TC-G07-003: unsupported duration (7 months) → 400 Bad Request', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 7,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/must be one of/i);
  });

  test('TC-G07-004: supported duration (3 months) → 201 Created', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
  });

  test('TC-G07-005: duration change rejected when a root period with different configuration exists → 409', async () => {
    // A root period that was configured for 3 months.
    // The new contract requests 6 months — a genuine conflict → 409.
    // The checkpoint-based guard reads the original day_numbers from checkpoints.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        5,
      start_date:       '2026-02-01',
      end_date:         '2026-05-01',
      parent_period_id: null,
    });
    // Supply the 3-month original checkpoints so deriveOriginalDurationFromCheckpoints
    // returns 3 (not null), enabling the conflict comparison.
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30 }, { day_number: 60 }, { day_number: 90 },
    ]);
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 6,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cannot be changed/i);
    // EvaluationCheckpoint.count is no longer consulted for the duration guard
    expect(m.EvaluationCheckpoint.count).not.toHaveBeenCalled();
  });

  test('TC-G07-006: duration 12 months (supported) → 201 Created', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 12,
    });
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
  });
});

// =============================================================================
// G07 — Area 3: Fixed-term contract_end_date
// =============================================================================
describe('G07 Area 3 — Fixed-term contract_end_date', () => {

  test('TC-G07-007: FIXED_TERM without contract_end_date → 400 Bad Request', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'FIXED_TERM', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
      // contract_end_date omitted
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/contract_end_date is required/i);
  });

  test('TC-G07-008: FIXED_TERM with contract_end_date = start_date → 400 Bad Request', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'FIXED_TERM', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
      contract_end_date: '2026-02-01', // same as profile.start_date
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/must be after/i);
  });

  test('TC-G07-009: FIXED_TERM with valid contract_end_date → 201, date persisted in Contract.create', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'FIXED_TERM', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
      contract_end_date: '2027-02-01',
    });
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(m.Contract.create).toHaveBeenCalledWith(
      expect.objectContaining({ contract_end_date: '2027-02-01' }),
      expect.anything()
    );
  });

  test('TC-G07-010: PROBATIONARY contract — contract_end_date not required → 201', async () => {
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
    });
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
  });
});

// =============================================================================
// G07 — Area 1: No-probation contract reconciliation
// =============================================================================
describe('G07 Area 1 — No-probation contract (probation_clause_included = false)', () => {

  const noProbBody = {
    profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
    probation_clause_included: false,
  };

  test('TC-G07-011: EmployeeProfile.update called with PERMANENT inside the transaction', async () => {
    const { req, res } = makeReqRes(noProbBody);
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(m.EmployeeProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ employment_status: 'PERMANENT' }),
      expect.objectContaining({ where: { profile_id: 10 } })
    );
  });

  test('TC-G07-012: ProbationPeriod.update called with CANCELLED (not DISMISSED)', async () => {
    const { req, res } = makeReqRes(noProbBody);
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(m.ProbationPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELLED' }),
      expect.anything()
    );
    // DISMISSED must NOT appear in any update payload
    for (const [payload] of m.ProbationPeriod.update.mock.calls) {
      expect(payload.status).not.toBe('DISMISSED');
    }
  });

  test('TC-G07-013: EvaluationCheckpoint.update called with CANCELLED; where clause includes PENDING and OVERDUE', async () => {
    const { req, res } = makeReqRes(noProbBody);
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);

    // Find the EvaluationCheckpoint.update call that sets status = CANCELLED
    const cancelCall = m.EvaluationCheckpoint.update.mock.calls
      .find(([data]) => data.status === 'CANCELLED');
    expect(cancelCall).toBeDefined();

    const [, opts] = cancelCall;
    // The where.status must contain an Op.in filter with both PENDING and OVERDUE.
    // Op is a Symbol key, so it is not iterated by Object.values(); access directly.
    const statusFilter = opts.where.status;
    expect(typeof statusFilter).toBe('object');
    // Both test and controller import Op from the same mocked 'sequelize' module,
    // so Op.in here is the same Symbol reference used in the controller.
    const filterValues = statusFilter[Op.in];
    expect(filterValues).toEqual(expect.arrayContaining(['PENDING', 'OVERDUE']));
  });

  test('TC-G07-014: string "false" for probation_clause_included → same reconciliation', async () => {
    const { req, res } = makeReqRes({ ...noProbBody, probation_clause_included: 'false' });
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(m.EmployeeProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ employment_status: 'PERMANENT' }),
      expect.anything()
    );
  });

  test('TC-G07-015: probation_clause_included = true → no cancellation calls', async () => {
    const { req, res } = makeReqRes({ ...noProbBody, probation_clause_included: true });
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(m.ProbationPeriod.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'CANCELLED' }),
      expect.anything()
    );
    expect(m.EvaluationCheckpoint.update).not.toHaveBeenCalled();
  });

  test('TC-G07-019: OVERDUE checkpoints are cancelled alongside PENDING ones', async () => {
    // Verifies that the status filter explicitly includes OVERDUE, not just PENDING.
    const { req, res } = makeReqRes(noProbBody);
    await createContract(req, res);

    const cancelCall = m.EvaluationCheckpoint.update.mock.calls
      .find(([data]) => data.status === 'CANCELLED');
    expect(cancelCall).toBeDefined();

    // PENDING must be in the filter (Op.in is a Symbol — access directly, not via Object.values)
    const statusFilter = cancelCall[1].where.status;
    const inValues = statusFilter[Op.in];
    expect(inValues).toContain('PENDING');
    // OVERDUE must also be in the filter
    expect(inValues).toContain('OVERDUE');
    // COMPLETED must NOT be in the filter (preserve history)
    expect(inValues).not.toContain('COMPLETED');
  });
});

// =============================================================================
// G07 — Area 4: Atomicity
// =============================================================================
describe('G07 Area 4 — Atomicity (single transaction)', () => {

  test('TC-G07-016: Contract.create is called inside sequelize.transaction callback', async () => {
    let createdInsideTx = false;
    m.sequelize.transaction.mockImplementation(async (cb) => {
      m.Contract.create.mockImplementationOnce(async () => {
        createdInsideTx = true;
        return { contract_id: 1, toJSON: jest.fn().mockReturnThis() };
      });
      return cb({});
    });

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
    });
    await createContract(req, res);

    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(createdInsideTx).toBe(true);
    expect(m.sequelize.transaction).toHaveBeenCalledTimes(1);
  });

  test('TC-G07-017: transaction rolled back on Contract.create failure → 500', async () => {
    // Note: with a mocked transaction the rollback itself is simulated by the
    // promise rejection propagating out of the callback.  A real integration
    // test against MySQL would be needed to verify actual DB rollback.
    m.sequelize.transaction.mockImplementation(async (cb) => {
      m.Contract.create.mockRejectedValueOnce(new Error('DB write error'));
      return cb({});
    });

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
    });
    await createContract(req, res);

    const { status, body } = getResponse(res);
    expect(status).toBe(500);
    expect(body.success).toBe(false);
  });

  test('TC-G07-018: no-probation — EmployeeProfile.update and ProbationPeriod.update share one transaction object', async () => {
    const capturedTxArgs = [];
    const fakeTx = { id: 'test-tx-object' };

    m.sequelize.transaction.mockImplementation(async (cb) => cb(fakeTx));
    m.EmployeeProfile.update.mockImplementation(async (data, opts) => {
      capturedTxArgs.push(opts.transaction);
      return [1];
    });
    m.ProbationPeriod.update.mockImplementation(async (data, opts) => {
      capturedTxArgs.push(opts.transaction);
      return [1];
    });

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: false,
    });
    await createContract(req, res);

    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(capturedTxArgs.length).toBeGreaterThanOrEqual(2);
    expect(capturedTxArgs[0]).toBe(fakeTx);
    expect(capturedTxArgs[1]).toBe(fakeTx);
  });
});

// =============================================================================
// G07 — Guards: reject new evaluations when probation period is CANCELLED
// =============================================================================
describe('G07 Guards — evaluation submission blocked on CANCELLED probation', () => {

  // Build a stub checkpoint whose probation period is CANCELLED.
  const cancelledCheckpoint = {
    checkpoint_id: 99,
    status:        'CANCELLED',
    probationPeriod: {
      period_id:   7,
      profile_id:  10,
      status:      'CANCELLED',
      employeeProfile: { profile_id: 10, user_id: 5, manager_id: 2 },
    },
  };

  test('TC-G07-020: submitManagerEvaluation → 409 when probation period is CANCELLED', async () => {
    m.EvaluationCheckpoint.findByPk.mockResolvedValue(cancelledCheckpoint);
    // No existing manager eval (so the duplicate guard is not what fires)
    m.ManagerEvaluation.findOne.mockResolvedValue(null);

    const { req, res } = makeReqRes({
      scores: [
        { criterion_id: 1, raw_score: 4 },
        { criterion_id: 2, raw_score: 3 },
      ],
    });
    req.params = { checkpointId: '99' };
    req.user   = { user_id: 2, role: 'HR_ADMIN', first_name: 'Test', last_name: 'HR' };

    await submitManagerEvaluation(req, res);

    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cancelled/i);

    // Verify no evaluation record was written
    expect(m.ManagerEvaluation.create).not.toHaveBeenCalled();
  });

  test('TC-G07-021: submitSelfAssessment → 409 when probation period is CANCELLED', async () => {
    // For self-assessment the checkpoint must include the employee's own user_id
    const cancelledCheckpointForSelf = {
      ...cancelledCheckpoint,
      probationPeriod: {
        ...cancelledCheckpoint.probationPeriod,
        employeeProfile: { profile_id: 10, user_id: 5, manager_id: 2 },
      },
    };
    m.EvaluationCheckpoint.findByPk.mockResolvedValue(cancelledCheckpointForSelf);
    m.SelfAssessment.findOne.mockResolvedValue(null);

    const { req, res } = makeReqRes({
      scores: [
        { criterion_id: 1, raw_score: 4 },
        { criterion_id: 2, raw_score: 3 },
      ],
    });
    req.params = { checkpointId: '99' };
    // The employee's user_id must match the profile's user_id (5) for the
    // ownership check; then the CANCELLED guard fires.
    req.user   = { user_id: 5, role: 'NEW_EMPLOYEE', first_name: 'Test', last_name: 'Employee' };

    await submitSelfAssessment(req, res);

    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cancelled/i);

    expect(m.SelfAssessment.create).not.toHaveBeenCalled();
  });
});

// =============================================================================
// G07 — Area 2 extended: Duration conflict semantics (Issues 2 & 1 verification)
// =============================================================================
describe('G07 Area 2 extended — Duration conflict semantics', () => {

  test('TC-G07-023: same duration as existing root period with completed evaluations → 201 (not blocked)', async () => {
    // The old code rejected any duration when scored checkpoints existed.
    // The checkpoint-based guard allows a contract whose duration matches the
    // established configuration, even when evaluations have already been submitted.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        5,
      start_date:       '2026-02-01',
      end_date:         '2026-05-01',
      parent_period_id: null,
    });
    // Supply the 3-month original checkpoints so the lookup returns 3.
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30 }, { day_number: 60 }, { day_number: 90 },
    ]);
    // Some checkpoints are COMPLETED — must NOT block the matching-duration contract
    m.EvaluationCheckpoint.count.mockResolvedValue(3);

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3, // matches existing
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    // EvaluationCheckpoint.count is no longer part of the duration conflict guard
    expect(m.EvaluationCheckpoint.count).not.toHaveBeenCalled();
  });

  test('TC-G07-024: conflicting duration with no completed checkpoints → 409, no writes', async () => {
    // The checkpoint-based guard rejects a conflicting duration regardless of
    // how many evaluations have been scored.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        5,
      start_date:       '2026-02-01',
      end_date:         '2026-05-01',
      parent_period_id: null,
    });
    // Supply the 3-month original checkpoints so the lookup returns 3.
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30 }, { day_number: 60 }, { day_number: 90 },
    ]);
    m.EvaluationCheckpoint.count.mockResolvedValue(0); // no scored checkpoints

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 6, // conflicts
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cannot be changed/i);
    // No persistence should have occurred
    expect(m.Contract.create).not.toHaveBeenCalled();
    expect(m.sequelize.transaction).not.toHaveBeenCalled();
  });

  test('TC-G07-025: FIXED_TERM with contract_end_date (updated frontend payload shape) → 201, field persisted', async () => {
    // Verifies the exact field name the updated EmployeeDetailPage now sends.
    // The previous code sent end_date; the backend expects contract_end_date.
    const { req, res } = makeReqRes({
      profile_id:                10,
      contract_type:             'FIXED_TERM',
      basic_salary_mur:          28000,
      contract_end_date:         '2028-01-31', // correct field name
      probation_clause_included: true,
      probation_duration_months: 3,
      notice_period_days:        14,
      contract_reference:        'FT-2026-001',
    });
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(m.Contract.create).toHaveBeenCalledWith(
      expect.objectContaining({ contract_end_date: '2028-01-31' }),
      expect.anything()
    );
  });
});

// =============================================================================
// G07 — Area 3 extended: Real fixed-term date validation (Issue 3)
// =============================================================================
describe('G07 Area 3 extended — Fixed-term date validation', () => {

  test('TC-G07-026: FIXED_TERM with malformed date string "not-a-date" → 400 before persistence', async () => {
    // A plain string comparison would let "not-a-date" pass the guard because
    // "not-a-date" > "2026-02-01" is true lexicographically.
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'FIXED_TERM', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
      contract_end_date: 'not-a-date',
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(m.Contract.create).not.toHaveBeenCalled();
  });

  test('TC-G07-027: FIXED_TERM with impossible calendar date "2027-02-30" → 400', async () => {
    // JavaScript rolls "2027-02-30" forward to "2027-03-02".
    // The ISO-roundtrip check catches this and rejects it before persistence.
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'FIXED_TERM', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
      contract_end_date: '2027-02-30',
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(m.Contract.create).not.toHaveBeenCalled();
  });

  test('TC-G07-028: FIXED_TERM with contract_end_date before employee start_date → 400', async () => {
    // profile.start_date = '2026-02-01'; contract_end_date = '2025-12-01' (earlier)
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'FIXED_TERM', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
      contract_end_date: '2025-12-01',
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/must be after/i);
    expect(m.Contract.create).not.toHaveBeenCalled();
  });

  test('TC-G07-029: FIXED_TERM with valid leap day "2028-02-29" → 201, date persisted', async () => {
    // 2028 is a leap year (divisible by 4, not a century year).
    // The ISO-roundtrip check must accept this as a valid calendar date.
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'FIXED_TERM', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
      contract_end_date: '2028-02-29',
    });
    await createContract(req, res);
    const { status } = getResponse(res);
    expect(status).toBe(201);
    expect(m.Contract.create).toHaveBeenCalledWith(
      expect.objectContaining({ contract_end_date: '2028-02-29' }),
      expect.anything()
    );
  });
});

// =============================================================================
// G07 — Guards: Director approval blocked when probation period is CANCELLED
// =============================================================================
describe('G07 Guards — Director approval blocked on CANCELLED probation', () => {

  test('TC-G07-022: approveRecommendation → 409 when linked probation period is CANCELLED', async () => {
    // A recommendation that has reached the Director stage but whose probation
    // period was subsequently cancelled by a no-probation contract.
    m.FinalRecommendation.findByPk.mockResolvedValue({
      rec_id:              55,
      approval_status:     'PENDING_DIRECTOR',
      recommendation_type: 'CONFIRM',
      submitted_by:        3,
      probationPeriod: {
        period_id:  7,
        profile_id: 10,
        status:     'CANCELLED',
        end_date:   '2026-11-01',
      },
      update: jest.fn().mockResolvedValue(true),
      toJSON: jest.fn().mockReturnThis(),
    });

    const { req, res } = makeReqRes({ director_reason: 'Approved' });
    req.params = { recId: '55' };
    req.user   = { user_id: 9, role: 'DIRECTOR', first_name: 'Dir', last_name: 'Test' };

    await approveRecommendation(req, res);

    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cancelled/i);

    // The probation period must NOT be updated — the CANCELLED status must be preserved
    expect(m.ProbationPeriod.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// G07 — Defects 1 & 2: Checkpoint-based original-duration resolution
// =============================================================================
describe('G07 Defects 1 & 2 — Checkpoint-based original-duration resolution', () => {

  // ── Defect 1: Extension mutates root period end_date ──────────────────────
  // approveRecommendation(EXTEND) adds 90 days to the root period's end_date.
  // The old deriveProbationMonths(start, end) guard read this mutated end_date
  // and returned the wrong duration.  The checkpoint-based guard is immune
  // because it reads the immutable original day_numbers.

  test('TC-G07-030: original 3-month duration accepted after Director extension workflow', async () => {
    // Root period start='2026-09-01'.
    // Originally: end_date='2026-12-01' (3 months).  After EXTEND: '2027-03-01' (+90 days).
    // deriveProbationMonths('2026-09-01', '2027-03-01') would return 6 — wrong.
    // The checkpoint-based guard:
    //   1. Sees an 'Extension Review' checkpoint → hasExtension = true.
    //   2. Skips the date cross-check (end_date is intentionally mutated).
    //   3. Reverse-maps original day_numbers [30,60,90] → 3 months.
    // The 3-month contract must be accepted.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        5,
      start_date:       '2026-09-01',
      end_date:         '2027-03-01',   // ← end_date mutated by EXTEND (+90 days)
      parent_period_id: null,
    });
    // ALL checkpoints are returned; the Extension Review entry proves the
    // end_date mutation is intentional so the date cross-check is skipped.
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30,  checkpoint_label: null },
      { day_number: 60,  checkpoint_label: null },
      { day_number: 90,  checkpoint_label: null },
      { day_number: 180, checkpoint_label: 'Extension Review' },
    ]);

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    // Confirm the checkpoint lookup was called (not start/end derivation)
    expect(m.EvaluationCheckpoint.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ period_id: 5 }) })
    );
  });

  test('TC-G07-031: conflicting 6-month duration rejected after Director extension (original was 3 months)', async () => {
    // Same extension scenario as TC-G07-030.  The old guard would read the
    // mutated end_date, derive 6 months, and incorrectly allow 6 → 201.
    // The checkpoint-based guard:
    //   1. Sees Extension Review → skips date cross-check.
    //   2. Derives 3 months from original checkpoints.
    //   3. Rejects 6 (conflict) → 409.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        5,
      start_date:       '2026-09-01',
      end_date:         '2027-03-01',   // mutated by EXTEND
      parent_period_id: null,
    });
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30,  checkpoint_label: null },
      { day_number: 60,  checkpoint_label: null },
      { day_number: 90,  checkpoint_label: null },
      { day_number: 180, checkpoint_label: 'Extension Review' },
    ]);

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 6,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cannot be changed/i);
    expect(m.Contract.create).not.toHaveBeenCalled();
  });

  test('TC-G07-032: conflicting duration rejected when extended end_date does not align to any calendar-month boundary', async () => {
    // start='2026-02-01'.  Original 3-month end='2026-05-01'.
    // After EXTEND (+90 days from May 1): end_date='2026-07-30'.
    // deriveProbationMonths('2026-02-01', '2026-07-30') returns null (no match).
    // The old guard treated null as "do not block" → 12-month contract allowed (wrong).
    // The new guard:
    //   1. Sees Extension Review → skips the date cross-check.
    //   2. Derives 3 months from original checkpoints.
    //   3. Rejects 12 (conflict) → 409.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        5,
      start_date:       '2026-02-01',
      end_date:         '2026-07-30',   // not aligned to any calendar-month boundary
      parent_period_id: null,
    });
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30,  checkpoint_label: null },
      { day_number: 60,  checkpoint_label: null },
      { day_number: 90,  checkpoint_label: null },
      { day_number: 180, checkpoint_label: 'Extension Review' },
    ]);

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 12,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cannot be changed/i);
    expect(m.Contract.create).not.toHaveBeenCalled();
  });

  // ── Defect 2: Omitted duration bypassed validation ──────────────────────
  // When probation_duration_months was omitted, durMonths = null, the conflict
  // guard was skipped entirely, and Contract.create defaulted to 3 months.
  // This produced a mismatched contract for employees on longer probations.

  test('TC-G07-033: omitted probation_duration_months with existing 6-month probation → 201 with 6 months persisted', async () => {
    // Old code: durMonths = null → guard skipped → creates contract with 3 months (wrong).
    // New code: looks up established=6 → effectiveDurMonths=6 → creates with 6 months.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        5,
      start_date:       '2026-02-01',
      end_date:         '2026-08-01',   // 6 calendar months
      parent_period_id: null,
    });
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 60 }, { day_number: 120 }, { day_number: 180 }, // 6-month schedule
    ]);

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true,
      // probation_duration_months intentionally omitted
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(m.Contract.create).toHaveBeenCalledWith(
      expect.objectContaining({ probation_duration_months: 6 }),
      expect.anything()
    );
  });

  test('TC-G07-034: omitted duration against existing 2-month probation → 201 with 2 months persisted (not silently defaulted to 3)', async () => {
    // Old code: durMonths = null → creates with 3 months (default) instead of 2 (wrong).
    // New code: looks up established=2 → effectiveDurMonths=2 → creates with 2 months.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        6,
      start_date:       '2026-05-01',
      end_date:         '2026-07-01',   // 2 calendar months
      parent_period_id: null,
    });
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30 }, { day_number: 60 },  // 2-month schedule
    ]);

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true,
      // probation_duration_months intentionally omitted
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(m.Contract.create).toHaveBeenCalledWith(
      expect.objectContaining({ probation_duration_months: 2 }),
      expect.anything()
    );
  });

  // ── Ambiguous checkpoint schedule ────────────────────────────────────────
  // When the checkpoint day_numbers don't match any CHECKPOINT_MATRIX entry
  // (e.g. a custom legacy schedule), the system cannot safely validate.

  test('TC-G07-035: ambiguous checkpoint schedule (day_numbers match no CHECKPOINT_MATRIX entry) → 409 with clear error', async () => {
    // day_numbers [30, 60, 90, 120] do not match any CHECKPOINT_MATRIX entry.
    // Old code (null → "do not block") would have silently allowed any duration.
    // New code returns a clear 409 explaining the ambiguity.
    m.ProbationPeriod.findOne.mockResolvedValueOnce({
      period_id:        7,
      start_date:       '2026-01-01',
      end_date:         '2026-04-01',
      parent_period_id: null,
    });
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce([
      { day_number: 30 }, { day_number: 60 }, { day_number: 90 }, { day_number: 120 },
      // 4 checkpoints — no CHECKPOINT_MATRIX entry has 4 entries with this pattern
    ]);

    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 3,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    // Message must clearly state the ambiguity (distinct from the conflict message)
    expect(body.message).toMatch(/cannot be determined|original probation duration/i);
    expect(m.Contract.create).not.toHaveBeenCalled();
  });

  // ── Inconsistent configuration (Codex review finding) ────────────────────
  // An employee can be created with an explicit end date that diverges from
  // the checkpoint schedule assigned at registration.  The date cross-check
  // catches this: D_dates ≠ D_checkpoints → 409, no contract written.

  test('TC-G07-036: 6-month period (by dates) with 3-month checkpoint schedule and no extension → 409 for all durations', async () => {
    // Reviewed scenario: employee registered Feb 1 → Aug 1 2027 (6 months) but
    // assigned the [30, 60, 90] checkpoint schedule (3-month pattern).
    // No Extension Review checkpoint exists.
    // D_checkpoints = 3 (from [30,60,90]); D_dates = 6 (Feb→Aug).
    // 3 ≠ 6 → deriveOriginalDurationFromCheckpoints returns null → 409.
    // The old code would read deriveProbationMonths(start, end) = 6 and
    // allowed a 6-month contract, or skipped the guard entirely for omitted
    // duration, silently creating a 3-month record.
    const basePeriod = {
      period_id:        9,
      start_date:       '2027-02-01',
      end_date:         '2027-08-01',   // 6 calendar months
      parent_period_id: null,
    };
    const inconsistentCheckpoints = [
      { day_number: 30, checkpoint_label: null },
      { day_number: 60, checkpoint_label: null },
      { day_number: 90, checkpoint_label: null },
      // ← 3-month schedule; no Extension Review → cross-check applies
    ];

    // Sub-case A: explicit 6-month duration (matches dates but not checkpoints)
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(inconsistentCheckpoints);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 6,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    // Reset mocks between sub-cases
    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case B: omitted duration (must NOT silently default to 3 months)
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(inconsistentCheckpoints);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true,
        // probation_duration_months intentionally omitted
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    // Reset mocks between sub-cases
    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case C: explicit 3-month duration (matches checkpoints but not dates)
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(inconsistentCheckpoints);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 3,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }
  });
});

// =============================================================================
// G07 — Legacy-plus-extension defect
// TC-G07-037 through TC-G07-042
//
// Policy: When any original checkpoint carries a "Day-N Review" label, the
// checkpoint schedule was produced by the legacy day-offset path in
// createEmployee and its day_numbers do NOT prove the original probation
// duration.  deriveOriginalDurationFromCheckpoints must return null, causing
// createContract to respond 409 regardless of extension state.
//
// TC-G07-037/038/039 demonstrate the failing cases on e130e38:
//   - TC-G07-037 (no extension):   cross-check catches mismatch → 409 (passes
//     on old code for a different reason; still passes after fix).
//   - TC-G07-038 (one extension):  hasExtension=true skips cross-check →
//     matchedMonths=3 → explicit-3 and omitted-duration return 201 (WRONG on
//     e130e38); after fix hasLegacyLabels=true → null → 409.
//   - TC-G07-039 (two extensions): same wrong behaviour as TC-G07-038 on
//     e130e38; fixed identically.
//
// TC-G07-040/041/042 confirm that calendar-matrix periods (Month-N labels)
// are unaffected by the guard and behave correctly both before and after the
// fix.
// =============================================================================

describe('G07 — Legacy Day-X labels: ambiguity survives extension (TC-G07-037 to TC-G07-042)', () => {
  // ── TC-G07-037 ─────────────────────────────────────────────────────────
  // 6-month period (Day-X labels), NO extension → 409 for all three inputs.
  // On e130e38: cross-check catches D_checkpoints(3) ≠ D_dates(6) → null → 409.
  // After fix:  hasLegacyLabels=true → null → 409 (same outcome, different path).
  test('TC-G07-037: legacy Day-X labels, no extension → 409 for explicit-3, omitted, explicit-6', async () => {
    const basePeriod = {
      period_id:        10,
      start_date:       '2027-02-01',
      end_date:         '2027-08-01',   // 6 calendar months
      parent_period_id: null,
    };
    const legacyCheckpoints = [
      { day_number: 30, checkpoint_label: 'Day-30 Review' },
      { day_number: 60, checkpoint_label: 'Day-60 Review' },
      { day_number: 90, checkpoint_label: 'Day-90 Review' },
    ];

    // Sub-case A: explicit 3-month
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyCheckpoints);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 3,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case B: omitted duration
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyCheckpoints);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case C: explicit 6-month
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyCheckpoints);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 6,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }
  });

  // ── TC-G07-038 ─────────────────────────────────────────────────────────
  // 6-month period (Day-X labels), ONE extension → still 409 for all inputs.
  // On e130e38: hasExtension=true skips cross-check; matchedMonths=3 (from
  //   {30,60,90}); explicit-3 → 201 (WRONG); omitted → 201 (WRONG); 6 → 409.
  //   Sub-cases A and B therefore FAIL on e130e38.
  // After fix: hasLegacyLabels=true → null → 409 for all three.
  test('TC-G07-038: legacy Day-X labels, one extension → 409 for explicit-3, omitted, explicit-6', async () => {
    const basePeriod = {
      period_id:        10,
      start_date:       '2027-02-01',
      end_date:         '2027-10-30',   // end_date mutated +90 days after EXTEND
      parent_period_id: null,
    };
    const legacyPlusExtension = [
      { day_number:  30, checkpoint_label: 'Day-30 Review' },
      { day_number:  60, checkpoint_label: 'Day-60 Review' },
      { day_number:  90, checkpoint_label: 'Day-90 Review' },
      { day_number: 180, checkpoint_label: 'Extension Review' },
    ];

    // Sub-case A: explicit 3-month
    // FAILS on e130e38: returns 201 (incorrectly accepts 3 months)
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 3,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case B: omitted duration
    // FAILS on e130e38: returns 201 and silently persists 3 months
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case C: explicit 6-month (passes on both versions, different reason)
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 6,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }
  });

  // ── TC-G07-039 ─────────────────────────────────────────────────────────
  // 6-month period (Day-X labels), TWO extensions → still 409 for all inputs.
  // Same wrong behaviour on e130e38 as TC-G07-038 (sub-cases A and B FAIL).
  test('TC-G07-039: legacy Day-X labels, two extensions → 409 for explicit-3, omitted, explicit-6', async () => {
    const basePeriod = {
      period_id:        10,
      start_date:       '2027-02-01',
      end_date:         '2028-01-28',   // end_date mutated twice (+180 days total)
      parent_period_id: null,
    };
    const legacyPlusTwoExtensions = [
      { day_number:  30, checkpoint_label: 'Day-30 Review' },
      { day_number:  60, checkpoint_label: 'Day-60 Review' },
      { day_number:  90, checkpoint_label: 'Day-90 Review' },
      { day_number: 180, checkpoint_label: 'Extension Review' },
      { day_number: 270, checkpoint_label: 'Extension Review' },
    ];

    // Sub-case A: explicit 3-month — FAILS on e130e38 (returns 201)
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyPlusTwoExtensions);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 3,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case B: omitted duration — FAILS on e130e38 (returns 201, persists 3 months)
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyPlusTwoExtensions);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case C: explicit 6-month
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(legacyPlusTwoExtensions);
    {
      const { req, res } = makeReqRes({
        profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 6,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be determined|original probation duration/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }
  });

  // ── TC-G07-040 ─────────────────────────────────────────────────────────
  // Calendar-matrix 3-month period, one extension → guard does NOT fire.
  // "Month N Review" labels are not matched by LEGACY_DAY_LABEL_RE.
  // Passes on both e130e38 and after the fix.
  test('TC-G07-040: calendar-matrix 3-month, one extension → 3-month accepted, 6-month rejected', async () => {
    const basePeriod = {
      period_id:        11,
      start_date:       '2026-02-01',
      end_date:         '2026-07-30',   // end_date mutated +90 days after EXTEND
      parent_period_id: null,
    };
    const matrixPlusExtension = [
      { day_number:  30, checkpoint_label: 'Month 1 Review' },
      { day_number:  60, checkpoint_label: 'Month 2 Review' },
      { day_number:  90, checkpoint_label: 'Month 3 Final Checkpoint' },
      { day_number: 180, checkpoint_label: 'Extension Review' },
    ];

    // Sub-case A: explicit 3-month (matches established duration) → 201
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(matrixPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 11, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 3,
      });
      await createContract(req, res);
      const { status } = getResponse(res);
      expect(status).toBe(201);
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case B: explicit 6-month (conflicts) → 409
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(matrixPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 11, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 6,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be changed|probation_duration_months/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case C: omitted duration (defaults to established 3 months) → 201,
    // and Contract.create must be called with probation_duration_months: 3
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(matrixPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 11, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true,
      });
      await createContract(req, res);
      const { status } = getResponse(res);
      expect(status).toBe(201);
      expect(m.Contract.create).toHaveBeenCalledWith(
        expect.objectContaining({ probation_duration_months: 3 }),
        expect.anything(),
      );
    }
  });

  // ── TC-G07-041 ─────────────────────────────────────────────────────────
  // Calendar-matrix 6-month period, one extension → guard does NOT fire.
  // Passes on both e130e38 and after the fix.
  test('TC-G07-041: calendar-matrix 6-month, one extension → 6-month accepted, 3-month rejected', async () => {
    const basePeriod = {
      period_id:        12,
      start_date:       '2026-02-01',
      end_date:         '2026-11-28',   // end_date mutated +90 days after EXTEND
      parent_period_id: null,
    };
    const matrixPlusExtension = [
      { day_number:  60, checkpoint_label: 'Month 2 Review' },
      { day_number: 120, checkpoint_label: 'Month 4 Review' },
      { day_number: 180, checkpoint_label: 'Month 6 Final Checkpoint' },
      { day_number: 270, checkpoint_label: 'Extension Review' },
    ];

    // Sub-case A: explicit 6-month (matches established duration) → 201
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(matrixPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 12, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 6,
      });
      await createContract(req, res);
      const { status } = getResponse(res);
      expect(status).toBe(201);
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case B: explicit 3-month (conflicts) → 409
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(matrixPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 12, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true, probation_duration_months: 3,
      });
      await createContract(req, res);
      const { status, body } = getResponse(res);
      expect(status).toBe(409);
      expect(body.message).toMatch(/cannot be changed|probation_duration_months/i);
      expect(m.Contract.create).not.toHaveBeenCalled();
    }

    jest.clearAllMocks();
    m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
    m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

    // Sub-case C: omitted duration (defaults to established 6 months) → 201,
    // Contract.create called with probation_duration_months: 6
    m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
    m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(matrixPlusExtension);
    {
      const { req, res } = makeReqRes({
        profile_id: 12, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
        probation_clause_included: true,
      });
      await createContract(req, res);
      const { status } = getResponse(res);
      expect(status).toBe(201);
      expect(m.Contract.create).toHaveBeenCalledWith(
        expect.objectContaining({ probation_duration_months: 6 }),
        expect.anything(),
      );
    }
  });

  // ── TC-G07-042 ─────────────────────────────────────────────────────────
  // Calendar-matrix {1, 2, 12}-month periods, one extension each → guard
  // does NOT fire; matching duration accepted, conflicting rejected.
  // Passes on both e130e38 and after the fix.
  test('TC-G07-042: calendar-matrix 1/2/12-month with extension → unchanged accepted, conflicting rejected', async () => {
    const cases = [
      {
        label:      '1-month',
        period_id:  13,
        start_date: '2026-03-01',
        end_date:   '2026-07-30',   // mutated +90 days
        checkpoints: [
          { day_number:  30, checkpoint_label: 'Month 1 Final Checkpoint' },
          { day_number: 120, checkpoint_label: 'Extension Review' },
        ],
        establishedMonths: 1,
        conflictingMonths: 3,
      },
      {
        label:      '2-month',
        period_id:  14,
        start_date: '2026-03-01',
        end_date:   '2026-08-28',   // mutated +90 days
        checkpoints: [
          { day_number:  30, checkpoint_label: 'Month 1 Review' },
          { day_number:  60, checkpoint_label: 'Month 2 Final Checkpoint' },
          { day_number: 150, checkpoint_label: 'Extension Review' },
        ],
        establishedMonths: 2,
        conflictingMonths: 6,
      },
      {
        label:      '12-month',
        period_id:  15,
        start_date: '2025-01-01',
        end_date:   '2026-07-02',   // mutated +90 days
        checkpoints: [
          { day_number:  90, checkpoint_label: 'Month 3 Review' },
          { day_number: 180, checkpoint_label: 'Month 6 Review' },
          { day_number: 270, checkpoint_label: 'Month 9 Review' },
          { day_number: 360, checkpoint_label: 'Month 12 Final Checkpoint' },
          { day_number: 450, checkpoint_label: 'Extension Review' },
        ],
        establishedMonths: 12,
        conflictingMonths: 6,
      },
    ];

    for (const c of cases) {
      const basePeriod = {
        period_id:        c.period_id,
        start_date:       c.start_date,
        end_date:         c.end_date,
        parent_period_id: null,
      };

      // Matching duration → 201
      m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
      m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(c.checkpoints);
      {
        const { req, res } = makeReqRes({
          profile_id: c.period_id, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
          probation_clause_included: true,
          probation_duration_months: c.establishedMonths,
        });
        await createContract(req, res);
        const { status } = getResponse(res);
        expect(status).toBe(201);
      }

      jest.clearAllMocks();
      m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
      m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });

      // Conflicting duration → 409
      m.ProbationPeriod.findOne.mockResolvedValueOnce(basePeriod);
      m.EvaluationCheckpoint.findAll.mockResolvedValueOnce(c.checkpoints);
      {
        const { req, res } = makeReqRes({
          profile_id: c.period_id, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
          probation_clause_included: true,
          probation_duration_months: c.conflictingMonths,
        });
        await createContract(req, res);
        const { status, body } = getResponse(res);
        expect(status).toBe(409);
        expect(body.message).toMatch(/cannot be changed|probation_duration_months/i);
        expect(m.Contract.create).not.toHaveBeenCalled();
      }

      jest.clearAllMocks();
      m.sequelize.transaction.mockImplementation(async (cb) => cb({}));
      m.Contract.create.mockResolvedValue({ contract_id: 1, toJSON: jest.fn().mockReturnThis() });
    }
  });
});
