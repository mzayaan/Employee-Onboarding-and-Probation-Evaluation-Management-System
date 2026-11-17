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
      update:   jest.fn().mockResolvedValue([2]),
      findByPk: jest.fn().mockResolvedValue(null),
    },

    EvaluationCheckpoint: {
      count:    jest.fn().mockResolvedValue(0),
      update:   jest.fn().mockResolvedValue([3]),
      findOne:  jest.fn().mockResolvedValue(null),
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
  m.ProbationPeriod.update.mockResolvedValue([2]);
  m.EvaluationCheckpoint.count.mockResolvedValue(0);
  m.EvaluationCheckpoint.update.mockResolvedValue([3]);
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

  test('TC-G07-005: duration change rejected when scored checkpoints exist → 409', async () => {
    m.EvaluationCheckpoint.count.mockResolvedValue(1);
    const { req, res } = makeReqRes({
      profile_id: 10, contract_type: 'PROBATIONARY', basic_salary_mur: 25000,
      probation_clause_included: true, probation_duration_months: 6,
    });
    await createContract(req, res);
    const { status, body } = getResponse(res);
    expect(status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/cannot be changed/i);
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
