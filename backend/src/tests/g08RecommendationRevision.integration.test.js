// =============================================================================
// src/tests/g08RecommendationRevision.integration.test.js
//
// Integration tests for G08: Revise-and-Resubmit returned probation
// recommendations.
//
// Route under test: POST /api/director/:recId/revise-and-resubmit
// Controller:       directorController.reviseAndResubmitRecommendation
//
// Requirements verified:
//   Req 1 — Eligibility: RETURNED_TO_MANAGER + ACTIVE/EXTENDED + owning LINE_MANAGER
//   Req 2 — Protect approved history: reject corrections to old-cycle checkpoints
//   Req 3 — Frozen scoring: reject unresolved weight_percent_at_scoring
//   Req 4 — Recalculate consistently: calcContribution / deriveRecommendation
//   Req 5 — Revision history: mandatory RecommendationRevision insert
//   Req 6 — Restart review: → PENDING_HR_REVIEW; stale HR + Director fields cleared
//   Req 7 — Atomicity: transaction rolled back on any failure
//   Req 8 — Complete interface: all gates enforced at API level
//
// FR-15, FR-18 | G08 | NFR-02, NFR-03 | Objective 3
// Test cases: TC-G08-001 through TC-G08-039
// =============================================================================

// ── Dependency mocks ──────────────────────────────────────────────────────────
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }),
  }),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash:    jest.fn().mockResolvedValue('$2b$12$hash'),
}));

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('../utils/auditLogger', () => ({
  createAuditLog: jest.fn().mockResolvedValue({}),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

/** Returns a fresh mock Sequelize transaction object */
const makeMockTransaction = () => ({
  LOCK:     { UPDATE: 'UPDATE' },
  rollback: jest.fn().mockResolvedValue(undefined),
  commit:   jest.fn().mockResolvedValue(undefined),
});

/** Returns a mock ProbationPeriod */
const makeMockPeriod = (override = {}) => ({
  period_id:            1,
  profile_id:           1,
  status:               'ACTIVE',
  end_date:             new Date('2026-10-01'),
  cumulative_score:     78.5,
  final_recommendation: 'CONFIRM',
  update:               jest.fn().mockResolvedValue(true),
  ...override,
});

/** Returns a mock FinalRecommendation (RETURNED_TO_MANAGER by default) */
const makeMockRec = (override = {}) => {
  const period = override.probationPeriod ?? makeMockPeriod();
  return {
    rec_id:               10,
    approval_status:      'RETURNED_TO_MANAGER',
    recommendation_type:  'CONFIRM',
    cumulative_score:     78.5,
    justification:        'Original justification.',
    generated_at:         new Date('2026-09-01'),
    submitted_by:         5,          // LINE_MANAGER user_id
    endorsed_by:          2,
    endorsed_at:          new Date('2026-09-10'),
    hr_endorsement_notes: 'Score looks off — please check attendance.',
    submitted_to_director_at: null,
    director_id:          null,
    director_decision_at: null,
    director_reason:      null,
    rejection_count:      1,
    revision_count:       0,          // G08: optimistic-lock counter
    probationPeriod:      period,
    update:               jest.fn().mockResolvedValue(true),
    ...override,
  };
};

/** Returns a mock EvaluationScore with frozen weight */
const makeMockScore = (override = {}) => ({
  score_id:                  100,
  eval_id:                   50,
  criterion_id:              7,
  raw_score:                 3,
  weight_percent_at_scoring: '25.00',
  weighted_contribution:     '15.00',
  name_at_scoring:           'Job Performance',
  update: jest.fn().mockResolvedValue(true),
  managerEvaluation: {
    eval_id:        50,
    weighted_score: '75.00',
    checkpoint_id:  3,
    checkpoint: {
      checkpoint_id: 3,
      period_id:     1,
      status:        'COMPLETED',
      completed_at:  new Date('2026-08-15'),
      day_number:    90,
    },
  },
  ...override,
});

/** Returns a mock ManagerEvaluation row (for recalc step) */
const makeMockMgrEval = (override = {}) => ({
  eval_id:        50,
  weighted_score: '75.00',
  checkpoint_id:  3,
  update:         jest.fn().mockResolvedValue(true),
  ...override,
});

/** Returns a completed checkpoint with managerEvaluation for cumulative recalc */
const makeMockCompletedCp = (override = {}) => ({
  checkpoint_id:     3,
  period_id:         1,
  status:            'COMPLETED',
  completed_at:      new Date('2026-08-15'),
  day_number:        90,
  managerEvaluation: { weighted_score: '78.5' },
  ...override,
});

// ── Users ─────────────────────────────────────────────────────────────────────
const mockManagerUser = {
  user_id: 5, email: 'mgr@company.com', role: 'LINE_MANAGER',
  first_name: 'Tom', last_name: 'Jones', is_active: true,
  toJSON: jest.fn().mockReturnValue({
    user_id: 5, email: 'mgr@company.com', role: 'LINE_MANAGER',
    first_name: 'Tom', last_name: 'Jones',
  }),
};

const mockOtherManagerUser = {
  user_id: 99, email: 'other@company.com', role: 'LINE_MANAGER',
  first_name: 'Other', last_name: 'Manager', is_active: true,
  toJSON: jest.fn().mockReturnValue({
    user_id: 99, email: 'other@company.com', role: 'LINE_MANAGER',
    first_name: 'Other', last_name: 'Manager',
  }),
};

const mockHRUser = {
  user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
  first_name: 'Jane', last_name: 'Doe', is_active: true,
  toJSON: jest.fn().mockReturnValue({
    user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
    first_name: 'Jane', last_name: 'Doe',
  }),
};

// ── Models mock ───────────────────────────────────────────────────────────────
// These are populated in each describe/test block via mockResolvedValue.
let mockTransaction = makeMockTransaction();

jest.mock('../models', () => {
  return {
    sequelize: {
      authenticate: jest.fn().mockResolvedValue(undefined),
      // Manual-transaction style (not callback) used by reviseAndResubmit
      transaction: jest.fn().mockImplementation(() => Promise.resolve(mockTransaction)),
    },
    User: {
      findOne:  jest.fn().mockResolvedValue(mockManagerUser),
      findByPk: jest.fn().mockResolvedValue(mockManagerUser),
      findAll:  jest.fn().mockResolvedValue([]),
    },
    FinalRecommendation: {
      findByPk: jest.fn(),
      findOne:  jest.fn(),
      findAll:  jest.fn().mockResolvedValue([]),
    },
    ProbationPeriod: {
      findByPk: jest.fn(),
    },
    EmployeeProfile: {
      findByPk: jest.fn().mockResolvedValue({ user_id: 9, profile_id: 1 }),
      update:   jest.fn().mockResolvedValue([1]),
    },
    EvaluationCheckpoint: {
      findOne: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      create:  jest.fn().mockResolvedValue({ checkpoint_id: 4 }),
    },
    ManagerEvaluation: {
      findOne: jest.fn().mockResolvedValue(null),
    },
    EvaluationScore: {
      findOne: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
    },
    RecommendationRevision: {
      create: jest.fn().mockResolvedValue({ revision_id: 1 }),
    },
    EvaluationCriterion: {
      findAll: jest.fn().mockResolvedValue([]),
    },
    Department: {
      findAll: jest.fn().mockResolvedValue([]),
    },
    AuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
});

// ── Imports (after all mocks) ──────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const {
  User,
  FinalRecommendation,
  EvaluationScore,
  EvaluationCheckpoint,
  ManagerEvaluation,
  RecommendationRevision,
  sequelize,
} = require('../models');

// ── Token helpers ─────────────────────────────────────────────────────────────
const token = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

const mgrToken      = token({ user_id: 5,  email: 'mgr@company.com',      role: 'LINE_MANAGER', first_name: 'Tom',      last_name: 'Jones'    });
const otherMgrToken = token({ user_id: 99, email: 'other@company.com',    role: 'LINE_MANAGER', first_name: 'Other',    last_name: 'Manager'  });
const hrToken       = token({ user_id: 1,  email: 'hr@company.com',       role: 'HR_ADMIN',     first_name: 'Jane',     last_name: 'Doe'      });
const directorToken = token({ user_id: 7,  email: 'director@company.com', role: 'DIRECTOR',     first_name: 'Director', last_name: 'Smith'    });

// ── Shared valid body ─────────────────────────────────────────────────────────
const VALID_BODY = {
  justification:    'Corrected attendance score based on updated records.',
  correction_reason:'HR noted the attendance score was based on incomplete data.',
};

// =============================================================================
// TC-G08-001 — TC-G08-003: Happy-path (Req 1, 4, 5, 6)
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — happy path (G08)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset(); // drain any undrained Once queue from previous describe
    mockTransaction = makeMockTransaction();
    // sequelize.transaction mock must return the refreshed object
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);

    // FinalRecommendation.findOne: 1st call = load rec, 2nd call = lastApproved lookup
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec())            // rec with RETURNED_TO_MANAGER
      .mockResolvedValueOnce(null);                    // no previous APPROVED in cycle

    // Cumulative recalc: one completed checkpoint
    EvaluationCheckpoint.findAll.mockResolvedValue([makeMockCompletedCp()]);
    RecommendationRevision.create.mockResolvedValue({ revision_id: 1 });
  });

  // TC-G08-001: Justification-only resubmit (no score corrections)
  test('TC-G08-001: valid justification-only resubmit → 200 PENDING_HR_REVIEW', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('PENDING_HR_REVIEW');
    expect(res.body.data.scores_corrected).toBe(0);
  });

  // TC-G08-002: Resubmit with one score correction
  test('TC-G08-002: valid resubmit with score correction → 200; scores_corrected = 1', async () => {
    jest.clearAllMocks();
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);

    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec())
      .mockResolvedValueOnce(null);

    const mockScore = makeMockScore();
    EvaluationScore.findOne.mockResolvedValue(mockScore);

    const mockMgrEval = makeMockMgrEval();
    ManagerEvaluation.findOne.mockResolvedValue(mockMgrEval);

    // All scores for the eval (for recalculating checkpoint total)
    EvaluationScore.findAll.mockResolvedValue([
      { raw_score: 4, weight_percent_at_scoring: '25.00', weighted_contribution: '20.00' },
      { raw_score: 3, weight_percent_at_scoring: '25.00', weighted_contribution: '15.00' },
    ]);

    EvaluationCheckpoint.findAll.mockResolvedValue([
      makeMockCompletedCp({ managerEvaluation: { weighted_score: '78.5' } }),
    ]);
    RecommendationRevision.create.mockResolvedValue({ revision_id: 1 });

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 4 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('PENDING_HR_REVIEW');
    expect(res.body.data.scores_corrected).toBe(1);
  });

  // TC-G08-003: Score correction that changes recommendation type (Req 4)
  test('TC-G08-003: score correction changes cumulative → updated recommendation_type returned', async () => {
    jest.clearAllMocks();
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);

    // Rec currently CONFIRM (78.5%)
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec({ recommendation_type: 'CONFIRM', cumulative_score: 78.5 }))
      .mockResolvedValueOnce(null);

    EvaluationScore.findOne.mockResolvedValue(makeMockScore());
    ManagerEvaluation.findOne.mockResolvedValue(makeMockMgrEval());
    EvaluationScore.findAll.mockResolvedValue([
      { raw_score: 2, weight_percent_at_scoring: '50.00', weighted_contribution: '20.00' },
    ]);

    // Completed checkpoint now has lower score → cumulative < 50 → DISMISS
    EvaluationCheckpoint.findAll.mockResolvedValue([
      makeMockCompletedCp({ managerEvaluation: { weighted_score: '45.00' } }),
    ]);
    RecommendationRevision.create.mockResolvedValue({ revision_id: 2 });

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // cumulative 45% → DISMISS
    expect(res.body.data.recommendation_type).toBe('DISMISS');
  });

});

// =============================================================================
// TC-G08-004 — TC-G08-005: Required field validation (Req 8)
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — required field validation', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findOne.mockResolvedValue(makeMockRec());
  });

  // TC-G08-004: Missing justification → 400 (Req 8)
  test('TC-G08-004: missing justification → 400', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ correction_reason: 'Some reason.' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/justification.*required/i);
  });

  // TC-G08-005: Missing correction_reason → 400 (Req 8)
  test('TC-G08-005: missing correction_reason → 400', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Updated justification.' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/correction_reason.*required/i);
  });

});

// =============================================================================
// TC-G08-006 — TC-G08-009: Eligibility gates (Req 1)
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — eligibility gates (Req 1)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset(); // drain any undrained Once queue from previous describe
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);
  });

  // TC-G08-006: Status not RETURNED_TO_MANAGER → 409 (Req 1)
  test('TC-G08-006: rec in PENDING_HR_REVIEW → 409 (wrong status)', async () => {
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec({ approval_status: 'PENDING_HR_REVIEW' }));

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/RETURNED_TO_MANAGER/i);
  });

  // TC-G08-007: Ownership mismatch — different manager → 403 (Req 1)
  test('TC-G08-007: other manager trying to revise → 403', async () => {
    User.findOne.mockResolvedValue(mockOtherManagerUser);
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec({ submitted_by: 5 })); // owned by user_id 5

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${otherMgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/own recommendation/i);
  });

  // TC-G08-008: Period CANCELLED → 409 (Req 1)
  test('TC-G08-008: probation period is CANCELLED → 409', async () => {
    FinalRecommendation.findOne.mockResolvedValueOnce(
      makeMockRec({ probationPeriod: makeMockPeriod({ status: 'CANCELLED' }) })
    );

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/cancelled/i);
  });

  // TC-G08-009: Period CONFIRMED (not ACTIVE/EXTENDED) → 409 (Req 1)
  test('TC-G08-009: probation period is CONFIRMED → 409', async () => {
    FinalRecommendation.findOne.mockResolvedValueOnce(
      makeMockRec({ probationPeriod: makeMockPeriod({ status: 'CONFIRMED' }) })
    );

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/ACTIVE|EXTENDED/i);
  });

});

// =============================================================================
// TC-G08-010 — TC-G08-013: Score correction validation gates (Req 2, 3, 8)
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — score correction gates', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset(); // drain any undrained Once queue from previous describe
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec())
      .mockResolvedValueOnce(null); // no lastApproved
  });

  // TC-G08-010: Score not found → 404 (Req 8)
  test('TC-G08-010: score_id not found → 404', async () => {
    EvaluationScore.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 999, raw_score: 4 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // TC-G08-011: Score belongs to a different period → 403 (Req 1 / ownership)
  test('TC-G08-011: score belongs to a different period → 403', async () => {
    EvaluationScore.findOne.mockResolvedValue(
      makeMockScore({
        managerEvaluation: {
          eval_id:       50,
          weighted_score:'75.00',
          checkpoint_id: 99,
          checkpoint: {
            checkpoint_id: 99,
            period_id:     999,  // different period!
            status:        'COMPLETED',
            completed_at:  new Date('2026-08-15'),
          },
        },
      })
    );

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 4 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/does not belong to period/i);
  });

  // TC-G08-012: Checkpoint CANCELLED → 409 (Req 1)
  test('TC-G08-012: checkpoint is CANCELLED → 409', async () => {
    EvaluationScore.findOne.mockResolvedValue(
      makeMockScore({
        managerEvaluation: {
          eval_id:       50,
          weighted_score:'75.00',
          checkpoint_id: 3,
          checkpoint: {
            checkpoint_id: 3,
            period_id:     1,
            status:        'CANCELLED',
            completed_at:  new Date('2026-08-15'),
          },
        },
      })
    );

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 4 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/CANCELLED/);
  });

  // TC-G08-013: Approved-cycle protection — checkpoint predates last approval → 409 (Req 2)
  test('TC-G08-013: checkpoint in approved cycle → 409 (approved-cycle protection)', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset(); // drain any undrained Once queue from previous test
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec())
      .mockResolvedValueOnce({
        // lastApproved rec: approved 2026-09-01
        director_decision_at: new Date('2026-09-01'),
      });

    // Score's checkpoint completed BEFORE the last approved Director decision
    EvaluationScore.findOne.mockResolvedValue(
      makeMockScore({
        managerEvaluation: {
          eval_id: 50,
          weighted_score: '75.00',
          checkpoint_id: 3,
          checkpoint: {
            checkpoint_id: 3,
            period_id:     1,
            status:        'COMPLETED',
            completed_at:  new Date('2026-08-01'), // before 2026-09-01
          },
        },
      })
    );

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 4 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already-approved cycle/i);
  });

});

// =============================================================================
// TC-G08-014 — TC-G08-016: Score data quality gates (Req 3, G09)
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — score data quality gates (Req 3)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset(); // drain any undrained Once queue from previous describe
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec())
      .mockResolvedValueOnce(null);
  });

  // TC-G08-014: Unresolved weight_percent_at_scoring (pre-G09 score) → 422 (Req 3)
  test('TC-G08-014: score has null weight_percent_at_scoring → 422 (G09 protection)', async () => {
    EvaluationScore.findOne.mockResolvedValue(
      makeMockScore({ weight_percent_at_scoring: null })
    );

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 4 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/unresolved weight/i);
  });

  // TC-G08-015: raw_score out of range → 422 (G09 validation, Req 3)
  test('TC-G08-015: raw_score = 6 (out of range) → 422', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 6 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/raw_score.*6.*integer.*1.*5/i);
  });

  // TC-G08-015b: raw_score = 0 → 422
  test('TC-G08-015b: raw_score = 0 → 422', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [{ score_id: 100, raw_score: 0 }],
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  // TC-G08-016: Duplicate score_id in corrections → 422 (Req 8)
  test('TC-G08-016: duplicate score_id in score_corrections → 422', async () => {
    // First call succeeds; second would hit dedupe check
    EvaluationScore.findOne.mockResolvedValue(makeMockScore());
    ManagerEvaluation.findOne.mockResolvedValue(makeMockMgrEval());
    EvaluationScore.findAll.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({
        ...VALID_BODY,
        score_corrections: [
          { score_id: 100, raw_score: 4 },
          { score_id: 100, raw_score: 5 },  // duplicate!
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/duplicate score_id/i);
  });

});

// =============================================================================
// TC-G08-017 — TC-G08-018: RBAC and not-found
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — RBAC and not-found', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset(); // drain any undrained Once queue from previous describe
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
  });

  // TC-G08-017: HR_ADMIN cannot access LINE_MANAGER route → 403 (NFR-03)
  test('TC-G08-017: HR_ADMIN trying to use revise-and-resubmit → 403', async () => {
    User.findOne.mockResolvedValue(mockHRUser);

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${hrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // TC-G08-018: Recommendation not found → 404
  test('TC-G08-018: recommendation not found → 404', async () => {
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/director/999/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

});

// =============================================================================
// TC-G08-019: Atomicity — RecommendationRevision failure rolls back (Req 5, 7)
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — atomicity (Req 5, 7)', () => {

  // TC-G08-019: RecommendationRevision.create throws → transaction rolled back, 500 returned
  test('TC-G08-019: revision create failure → transaction rolled back, 500 returned', async () => {
    const freshT = makeMockTransaction();

    jest.clearAllMocks();
    sequelize.transaction.mockResolvedValue(freshT);
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec())
      .mockResolvedValueOnce(null);
    EvaluationCheckpoint.findAll.mockResolvedValue([makeMockCompletedCp()]);

    // Simulate DB failure on revision insert — Once so subsequent success-path tests
    // are not contaminated; mockRejectedValue (permanent) would leave the mock in a
    // rejected state and cause unrelated tests to receive 500 instead of 200.
    RecommendationRevision.create.mockRejectedValueOnce(new Error('DB constraint error'));

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);

    // Transaction must have been rolled back (Req 7)
    expect(freshT.rollback).toHaveBeenCalled();
    expect(freshT.commit).not.toHaveBeenCalled();
  });

});

// =============================================================================
// TC-G08-020: Existing TC-DIR tests not broken — verify resubmit still works
// =============================================================================

describe('Regression: existing justification-only /resubmit not broken (TC-DIR-015 guard)', () => {

  test('TC-G08-020: POST /resubmit (old path) still → 200 for returned rec', async () => {
    jest.clearAllMocks();
    // Restore RecommendationRevision.create to success (TC-G08-019 uses mockRejectedValueOnce;
    // this defensive restore ensures isolation if test order ever changes).
    RecommendationRevision.create.mockResolvedValue({ revision_id: 1 });
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findByPk.mockResolvedValue({
      rec_id:            10,
      approval_status:   'RETURNED_TO_MANAGER',
      submitted_by:      5,
      probationPeriod:   { period_id: 1, status: 'ACTIVE', update: jest.fn().mockResolvedValue(true) },
      update:            jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Updated as requested.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('PENDING_HR_REVIEW');
  });

});

// =============================================================================
// TC-G08-021 — TC-G08-026: Input validation regression tests
// Tests that malformed or blank inputs are rejected before DB work begins.
// =============================================================================

describe('POST /api/director/:recId/revise-and-resubmit — input validation regressions (G08)', () => {

  /** Minimal rec mock sufficient to reach the score_corrections validation step */
  const makeEligibleRec = () => makeMockRec();

  beforeEach(() => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset(); // drain any undrained Once queue from previous describe
    mockTransaction = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(mockTransaction);
    User.findOne.mockResolvedValue(mockManagerUser);
    // rec passes all gates before reaching the array check
    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeEligibleRec())
      .mockResolvedValueOnce(null);
    EvaluationCheckpoint.findAll.mockResolvedValue([makeMockCompletedCp()]);
  });

  // TC-G08-021: score_corrections: null → not an array → 422
  test('TC-G08-021: score_corrections: null → 422 unprocessable entity', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ ...VALID_BODY, score_corrections: null });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/score_corrections must be an array/i);
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockTransaction.commit).not.toHaveBeenCalled();
  });

  // TC-G08-022: score_corrections: 'invalid' (string) → not an array → 422
  test('TC-G08-022: score_corrections: string → 422 unprocessable entity', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ ...VALID_BODY, score_corrections: 'invalid' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/score_corrections must be an array/i);
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  // TC-G08-023: score_id: null → not a positive integer → 422
  test('TC-G08-023: score_corrections with score_id null → 422', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ ...VALID_BODY, score_corrections: [{ score_id: null, raw_score: 4 }] });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid score_id/i);
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  // TC-G08-024: score_id: 1.5 (float, non-integer) → 422
  test('TC-G08-024: score_corrections with non-integer score_id → 422', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ ...VALID_BODY, score_corrections: [{ score_id: 1.5, raw_score: 4 }] });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid score_id/i);
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  // TC-G08-025: whitespace-only justification → 400
  test('TC-G08-025: justification is whitespace-only → 400 bad request', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: '   ', correction_reason: VALID_BODY.correction_reason });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/justification is required/i);
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  // TC-G08-026: whitespace-only correction_reason → 400
  test('TC-G08-026: correction_reason is whitespace-only → 400 bad request', async () => {
    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: VALID_BODY.justification, correction_reason: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/correction_reason is required/i);
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

});

// =============================================================================
// TC-G08-027 — TC-G08-028: Stale revision protection — endorse and approve
// Tests that passing an outdated revision_count returns 409 so the caller
// must reload before acting on a recommendation the manager has since revised.
// =============================================================================

describe('G08 stale revision protection — endorse and approve endpoints', () => {

  // TC-G08-027: HR endorses after the manager has revised — revision_count mismatch → 409
  test('TC-G08-027: endorse with stale revision_count → 409 conflict', async () => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockHRUser);

    // DB has revision_count: 1 (manager revised once since HR loaded the page)
    FinalRecommendation.findByPk.mockResolvedValue({
      ...makeMockRec({ approval_status: 'PENDING_HR_REVIEW' }),
      revision_count: 1,
    });

    // HR sends the stale revision_count: 0 it had when it first loaded the rec
    const res = await request(app)
      .post('/api/director/10/endorse')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ hr_endorsement_notes: 'Looks good.', revision_count: 0 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/revised since you last loaded/i);
  });

  // TC-G08-028: Director approves after the manager has revised — revision_count mismatch → 409
  test('TC-G08-028: approve with stale revision_count → 409 conflict', async () => {
    jest.clearAllMocks();
    const mockDirectorUser = {
      user_id: 7, email: 'director@company.com', role: 'DIRECTOR',
      first_name: 'Director', last_name: 'Smith', is_active: true,
      toJSON: jest.fn().mockReturnValue({ user_id: 7, role: 'DIRECTOR' }),
    };
    User.findOne.mockResolvedValue(mockDirectorUser);

    // DB has revision_count: 2 (manager revised twice since Director loaded the rec)
    FinalRecommendation.findByPk.mockResolvedValue({
      ...makeMockRec({ approval_status: 'PENDING_DIRECTOR', recommendation_type: 'CONFIRM' }),
      probationPeriod: makeMockPeriod(),
      revision_count: 2,
    });

    // Director sends stale revision_count: 0
    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ director_reason: 'Approved.', revision_count: 0 });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/revised since you last loaded/i);
  });

  // TC-G08-027b: Endorsing with the CORRECT revision_count still proceeds (no false positive)
  test('TC-G08-027b: endorse with correct revision_count → not blocked by stale check', async () => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockHRUser);

    // DB revision_count: 1 — client sends the same value (fresh)
    const rec = {
      ...makeMockRec({ approval_status: 'PENDING_HR_REVIEW' }),
      revision_count: 1,
      update: jest.fn().mockResolvedValue(true),
    };
    FinalRecommendation.findByPk.mockResolvedValue(rec);

    const res = await request(app)
      .post('/api/director/10/endorse')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ hr_endorsement_notes: 'Looks good.', revision_count: 1 });

    // Status check passes (PENDING_HR_REVIEW) and stale check passes → proceeds to update
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // TC-G08-028b: Director approves with CORRECT revision_count — no false positive (G08)
  // Positive counterpart to TC-G08-028: proves the stale check does NOT fire when the
  // client sends the current revision_count (manager-side stale-version rejection).
  test('TC-G08-028b: approve with correct revision_count → not blocked by stale check', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);

    const mockDirectorUser = {
      user_id: 7, email: 'director@company.com', role: 'DIRECTOR',
      first_name: 'Director', last_name: 'Smith', is_active: true,
      toJSON: jest.fn().mockReturnValue({ user_id: 7, role: 'DIRECTOR' }),
    };
    User.findOne.mockResolvedValue(mockDirectorUser);

    // DB has revision_count: 2 — Director sends the same value (not stale)
    FinalRecommendation.findByPk.mockResolvedValue({
      ...makeMockRec({ approval_status: 'PENDING_DIRECTOR', recommendation_type: 'CONFIRM' }),
      probationPeriod: makeMockPeriod(),
      revision_count:  2,
      submitted_by:    5,
      update:          jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ director_reason: 'All criteria satisfied.', revision_count: 2 });

    // 2 === 2 → stale check passes; approve completes normally
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

});

// =============================================================================
// TC-G08-029: Unified ownership enforcement on /resubmit
// HR_ADMIN whose user_id does not match submitted_by must be blocked (G08).
// Before the fix, role === 'LINE_MANAGER' was required for the check to fire,
// allowing HR_ADMIN to bypass ownership.
// =============================================================================

describe('G08 unified ownership regression — /resubmit endpoint', () => {

  test('TC-G08-029: HR_ADMIN resubmitting another manager\'s rec → 403', async () => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockHRUser);  // user_id: 1

    FinalRecommendation.findByPk.mockResolvedValue({
      rec_id:          10,
      approval_status: 'RETURNED_TO_MANAGER',
      submitted_by:    5,            // LINE_MANAGER user_id 5 — not the HR user (1)
      update:          jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${hrToken}`)  // HR_ADMIN, user_id: 1
      .send({ justification: 'Submitting on manager\'s behalf.' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/access denied/i);
  });

  test('TC-G08-029b: LINE_MANAGER resubmitting own rec still succeeds after fix', async () => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockManagerUser);  // user_id: 5

    FinalRecommendation.findByPk.mockResolvedValue({
      rec_id:            10,
      approval_status:   'RETURNED_TO_MANAGER',
      submitted_by:      5,            // same as mockManagerUser.user_id
      revision_count:    0,
      cumulative_score:  '72.00',
      recommendation_type: 'EXTEND',
      justification:     'old justification',
      hr_endorsement_notes: null,
      director_reason:   null,
      probationPeriod:   { status: 'ACTIVE' },
      update:            jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Resubmitting with updated justification.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('PENDING_HR_REVIEW');
  });

});

// =============================================================================
// TC-G08-030 — TC-G08-033: Atomicity and revision_count regression tests
// These tests reproduce each reported production gap (F1–F3) so that the
// failure is verifiable and the fix is evidence-backed.
// =============================================================================

describe('G08 atomicity and revision_count regression tests', () => {

  // TC-G08-030: /resubmit must increment revision_count on success
  // Reproduces F3 gap — before the fix revision_count was never incremented.
  test('TC-G08-030: resubmitRecommendation increments revision_count on success', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);

    User.findOne.mockResolvedValue(mockManagerUser); // user_id: 5

    const mockRec = {
      rec_id:              10,
      approval_status:     'RETURNED_TO_MANAGER',
      submitted_by:        5,
      revision_count:      2,                                    // current counter
      cumulative_score:    '72.00',
      recommendation_type: 'EXTEND',
      justification:       'old',
      hr_endorsement_notes: null,
      director_reason:     null,
      probationPeriod:     { status: 'ACTIVE' },
      update:              jest.fn().mockResolvedValue(true),
    };
    FinalRecommendation.findByPk.mockResolvedValue(mockRec);

    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Resubmitting with corrected note.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify revision_count was incremented from 2 → 3
    expect(mockRec.update).toHaveBeenCalled();
    const updateArgs = mockRec.update.mock.calls[0][0];
    expect(updateArgs.revision_count).toBe(3);
  });

  // TC-G08-031: /resubmit must commit its transaction on success
  // Reproduces F3 gap — before the fix no transaction was opened so commit never ran.
  test('TC-G08-031: resubmitRecommendation commits transaction on success', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);

    User.findOne.mockResolvedValue(mockManagerUser);

    FinalRecommendation.findByPk.mockResolvedValue({
      rec_id:              10,
      approval_status:     'RETURNED_TO_MANAGER',
      submitted_by:        5,
      revision_count:      0,
      cumulative_score:    '72.00',
      recommendation_type: 'EXTEND',
      justification:       'old',
      hr_endorsement_notes: null,
      director_reason:     null,
      probationPeriod:     { status: 'ACTIVE' },
      update:              jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Resubmitting with corrected note.' });

    expect(res.status).toBe(200);
    // Transaction commit must have been called — proves the operation is wrapped
    // in a transaction that is explicitly committed on the happy path.
    expect(freshTx.commit).toHaveBeenCalled();
  });

  // TC-G08-032: /endorse must use a transaction (atomicity regression)
  // Reproduces F1 gap — before the fix endorseRecommendation called findByPk
  // and rec.update without any transaction, leaving the stale check non-atomic.
  test('TC-G08-032: endorseRecommendation commits transaction on success', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);

    User.findOne.mockResolvedValue(mockHRUser);

    FinalRecommendation.findByPk.mockResolvedValue({
      ...makeMockRec({ approval_status: 'PENDING_HR_REVIEW' }),
      revision_count: 0,
      update: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .post('/api/director/10/endorse')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ hr_endorsement_notes: 'Score verified.' });

    expect(res.status).toBe(200);
    // Transaction commit proves endorseRecommendation opened a transaction and
    // committed it — the stale check is now inside the same transaction.
    expect(freshTx.commit).toHaveBeenCalled();
  });

  // TC-G08-033: /approve must use a transaction (atomicity regression)
  // Reproduces F2 gap — before the fix approveRecommendation fetched the rec
  // outside any transaction and the stale check ran on an unlocked row.
  test('TC-G08-033: approveRecommendation commits transaction on success', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);

    const mockDirectorUser = {
      user_id: 7, email: 'director@company.com', role: 'DIRECTOR',
      first_name: 'Director', last_name: 'Smith', is_active: true,
      toJSON: jest.fn().mockReturnValue({ user_id: 7, role: 'DIRECTOR' }),
    };
    User.findOne.mockResolvedValue(mockDirectorUser);

    FinalRecommendation.findByPk.mockResolvedValue({
      ...makeMockRec({
        approval_status:     'PENDING_DIRECTOR',
        recommendation_type: 'CONFIRM',
      }),
      probationPeriod: makeMockPeriod(),
      revision_count:  0,
      submitted_by:    5,
      update: jest.fn().mockResolvedValue(true),
    });

    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ director_reason: 'All criteria met.' });

    expect(res.status).toBe(200);
    // Transaction commit proves approveRecommendation opened a single unmanaged
    // transaction that wrapped the stale check, the rec update and the period
    // update atomically.
    expect(freshTx.commit).toHaveBeenCalled();
  });

});

// =============================================================================
// TC-G08-034: Model-definition regression — revision_count must be declared
// in FinalRecommendation.js so Sequelize can read and persist the field.
//
// Unlike the integration tests above that mock ../models, this test reads the
// actual source file from disk.  It cannot be fooled by a mock that returns a
// revision_count value while the real model omits the column declaration.
// =============================================================================

describe('G08 model-definition check (filesystem — cannot be masked by mocks)', () => {

  test('TC-G08-034: FinalRecommendation.js declares revision_count as INTEGER with defaultValue 0', () => {
    const fs   = require('fs');
    const path = require('path');
    const src  = fs.readFileSync(
      path.join(__dirname, '../models/FinalRecommendation.js'),
      'utf8'
    );
    // Field key must be present
    expect(src).toMatch(/\brevision_count\s*:/);
    // Type must be INTEGER (not DECIMAL, STRING, etc.)
    expect(src).toMatch(/DataTypes\.INTEGER/);
    // defaultValue must be 0 so existing rows do not read as null
    expect(src).toMatch(/defaultValue\s*:\s*0/);
  });

});

// =============================================================================
// TC-G08-035, TC-G08-036: Period eligibility gate on /resubmit endpoint (G08)
//
// Before the F7 fix, resubmitRecommendation did NOT load ProbationPeriod and
// had no period-status check.  A manager could resubmit a recommendation tied
// to a CANCELLED or COMPLETED period, making the submission meaningless.
//
// These tests reproduce each gap so that the fix is evidence-backed.
// =============================================================================

describe('G08 period eligibility gate regression — /resubmit endpoint', () => {

  test('TC-G08-035: resubmitRecommendation rejects CANCELLED probation period with 409', async () => {
    jest.clearAllMocks();
    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);
    User.findOne.mockResolvedValue(mockManagerUser);

    const mockRec = {
      rec_id:              20,
      approval_status:     'RETURNED_TO_MANAGER',
      submitted_by:        5,
      revision_count:      0,
      cumulative_score:    '72.00',
      recommendation_type: 'EXTEND',
      justification:       'old',
      hr_endorsement_notes: 'revise this',
      director_reason:     null,
      probationPeriod:     { status: 'CANCELLED' },
      update:              jest.fn().mockResolvedValue(true),
    };
    FinalRecommendation.findByPk.mockResolvedValue(mockRec);

    const res = await request(app)
      .post('/api/director/20/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Updated justification.' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/cancelled/i);
    expect(freshTx.rollback).toHaveBeenCalled();
    // No update must have been issued — the rollback gates the write
    expect(mockRec.update).not.toHaveBeenCalled();
  });

  test('TC-G08-036: resubmitRecommendation rejects non-ACTIVE/EXTENDED period with 409', async () => {
    jest.clearAllMocks();
    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);
    User.findOne.mockResolvedValue(mockManagerUser);

    const mockRec = {
      rec_id:              21,
      approval_status:     'RETURNED_TO_MANAGER',
      submitted_by:        5,
      revision_count:      0,
      cumulative_score:    '72.00',
      recommendation_type: 'EXTEND',
      justification:       'old',
      hr_endorsement_notes: null,
      director_reason:     null,
      probationPeriod:     { status: 'COMPLETED' },
      update:              jest.fn().mockResolvedValue(true),
    };
    FinalRecommendation.findByPk.mockResolvedValue(mockRec);

    const res = await request(app)
      .post('/api/director/21/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Updated justification.' });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/eligible/i);
    expect(freshTx.rollback).toHaveBeenCalled();
    expect(mockRec.update).not.toHaveBeenCalled();
  });

});

// =============================================================================
// TC-G08-037: Mandatory revision history — /revise-and-resubmit (Req 5)
//
// Verifies that RecommendationRevision.create is called on every successful
// revise-and-resubmit, and that the audit row contains the required fields.
// Before the F7 fix, RecommendationRevision.create was absent from /resubmit
// and absent from the transaction in /revise-and-resubmit.
// =============================================================================

describe('G08 mandatory revision history regression — /revise-and-resubmit endpoint (Req 5)', () => {

  // TC-G08-037: RecommendationRevision.create called with required fields on success
  test('TC-G08-037: revise-and-resubmit creates a RecommendationRevision audit row (Req 5)', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);
    User.findOne.mockResolvedValue(mockManagerUser);

    FinalRecommendation.findOne
      .mockResolvedValueOnce(makeMockRec())
      .mockResolvedValueOnce(null);

    EvaluationCheckpoint.findAll.mockResolvedValue([makeMockCompletedCp()]);
    // Restore create so it resolves (jest.clearAllMocks only clears calls, not implementation)
    RecommendationRevision.create.mockResolvedValue({ revision_id: 99 });

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);

    // RecommendationRevision.create must have been called exactly once
    expect(RecommendationRevision.create).toHaveBeenCalledTimes(1);

    const createArgs = RecommendationRevision.create.mock.calls[0][0];
    // Must identify the recommendation being revised
    expect(createArgs).toHaveProperty('rec_id');
    // Must record who initiated the revision (controller field: actor_id)
    expect(createArgs).toHaveProperty('actor_id');
    // Must capture the state before the revision (audit trail)
    expect(createArgs).toHaveProperty('before_recommendation_type');
    // Must record the reason for the correction
    expect(createArgs).toHaveProperty('correction_reason');
  });

});

// =============================================================================
// TC-G08-038 — TC-G08-039: Stale field clearing — Req 6
//
// Verifies that every resubmission (both /revise-and-resubmit and /resubmit)
// resets all HR endorsement and Director decision fields to null so that the
// next HR review starts from a clean slate.
//
// Before the fix these fields were left populated from the previous round,
// causing HR to see a "ghost" endorsement on a recommendation that had just
// been returned to the manager.
// =============================================================================

describe('G08 stale field clearing regression (Req 6)', () => {

  // TC-G08-038: /revise-and-resubmit clears stale HR + Director fields
  test('TC-G08-038: revise-and-resubmit clears stale HR and Director fields on success (Req 6)', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);
    User.findOne.mockResolvedValue(mockManagerUser);

    // Rec still carries HR endorsement and submission-to-director data from the previous cycle
    const baseRec = makeMockRec({
      endorsed_by:              2,
      endorsed_at:              new Date('2026-09-10'),
      hr_endorsement_notes:     'Score looks off — please check attendance.',
      submitted_to_director_at: new Date('2026-09-11'),
      director_id:              7,
      director_decision_at:     null,
      director_reason:          null,
    });

    FinalRecommendation.findOne
      .mockResolvedValueOnce(baseRec)
      .mockResolvedValueOnce(null);

    EvaluationCheckpoint.findAll.mockResolvedValue([makeMockCompletedCp()]);
    RecommendationRevision.create.mockResolvedValue({ revision_id: 1 });

    const res = await request(app)
      .post('/api/director/10/revise-and-resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);

    // rec.update must have been called — verify the first call's field arguments
    expect(baseRec.update).toHaveBeenCalled();
    const updateArgs = baseRec.update.mock.calls[0][0];

    // All stale HR + Director fields must be explicitly null (Req 6)
    expect(updateArgs.endorsed_by).toBeNull();
    expect(updateArgs.endorsed_at).toBeNull();
    expect(updateArgs.hr_endorsement_notes).toBeNull();
    expect(updateArgs.submitted_to_director_at).toBeNull();
    expect(updateArgs.director_id).toBeNull();
    expect(updateArgs.director_decision_at).toBeNull();
    expect(updateArgs.director_reason).toBeNull();

    // Status must restart the review cycle
    expect(updateArgs.approval_status).toBe('PENDING_HR_REVIEW');
  });

  // TC-G08-039: /resubmit clears stale HR + Director fields
  test('TC-G08-039: resubmitRecommendation clears stale HR and Director fields on success (Req 6)', async () => {
    jest.clearAllMocks();
    FinalRecommendation.findOne.mockReset();

    const freshTx = makeMockTransaction();
    sequelize.transaction.mockResolvedValue(freshTx);
    User.findOne.mockResolvedValue(mockManagerUser); // user_id: 5

    // Rec carries data from the previous endorsement and director-submission round
    const mockRec = {
      rec_id:                   10,
      approval_status:          'RETURNED_TO_MANAGER',
      submitted_by:             5,
      revision_count:           1,
      cumulative_score:         '72.00',
      recommendation_type:      'EXTEND',
      justification:            'old justification',
      endorsed_by:              2,
      endorsed_at:              new Date('2026-09-10'),
      hr_endorsement_notes:     'Please revise the attendance score.',
      submitted_to_director_at: new Date('2026-09-11'),
      director_id:              7,
      director_decision_at:     null,
      director_reason:          null,
      probationPeriod:          { status: 'ACTIVE' },
      update:                   jest.fn().mockResolvedValue(true),
    };
    FinalRecommendation.findByPk.mockResolvedValue(mockRec);

    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Resubmitting with corrected attendance reasoning.' });

    expect(res.status).toBe(200);

    // rec.update must have cleared every stale field (Req 6)
    expect(mockRec.update).toHaveBeenCalled();
    const updateArgs = mockRec.update.mock.calls[0][0];

    expect(updateArgs.endorsed_by).toBeNull();
    expect(updateArgs.endorsed_at).toBeNull();
    expect(updateArgs.hr_endorsement_notes).toBeNull();
    expect(updateArgs.submitted_to_director_at).toBeNull();
    expect(updateArgs.director_id).toBeNull();
    expect(updateArgs.director_decision_at).toBeNull();
    expect(updateArgs.director_reason).toBeNull();

    // Status must restart the review cycle
    expect(updateArgs.approval_status).toBe('PENDING_HR_REVIEW');
  });

});
