// =============================================================================
// src/tests/g09EvaluationTiming.integration.test.js
//
// Regression tests for G09 — Evaluation Timing and Historical Scoring Protection.
//
// Covers:
//   D1  Period COMPLETED / CONFIRMED / DISMISSED → reject new submissions
//   D2  Checkpoint CANCELLED → reject new submissions
//   D3  Submission before checkpoint due_date → reject (Mauritius timezone)
//   D4  getCheckpoint returns frozen criteria once a submission exists
//   D5  submitSelfAssessment uses manager's frozen criteria when manager went first
//   D6  submitManagerEvaluation uses employee's frozen criteria when employee went first
//   D7  getIp uses req.ip (not raw X-Forwarded-For)
//
// All tests use production route handlers and realistic mock relationships.
// No real database or HTTP server is started.
//
// FR-11, FR-13, FR-14 | NFR-02 | Objectives 2, 3
// =============================================================================

// Mock config/database FIRST (hoisted) so model files never call sequelize.define().
// The returned model stub must carry all Sequelize association methods so that
// models/index.js can call .belongsTo / .hasMany / .hasOne / .belongsToMany
// without throwing "is not a function".
const modelStub = () => {
  const stub = {
    belongsTo:      jest.fn(),
    hasMany:        jest.fn(),
    hasOne:         jest.fn(),
    belongsToMany:  jest.fn(),
    findAll:        jest.fn().mockResolvedValue([]),
    findOne:        jest.fn().mockResolvedValue(null),
    findByPk:       jest.fn().mockResolvedValue(null),
    create:         jest.fn().mockResolvedValue({}),
    update:         jest.fn().mockResolvedValue([1]),
    destroy:        jest.fn().mockResolvedValue(1),
    count:          jest.fn().mockResolvedValue(0),
    findOrCreate:   jest.fn().mockResolvedValue([{}, true]),
    bulkCreate:     jest.fn().mockResolvedValue([]),
    sync:           jest.fn().mockResolvedValue(undefined),
  };
  return stub;
};

jest.mock('../config/database', () => ({
  define:       jest.fn().mockImplementation(modelStub),
  transaction:  jest.fn(),
  query:        jest.fn(),
  authenticate: jest.fn().mockResolvedValue(undefined),
  DataTypes: {
    INTEGER: 'INTEGER', STRING: 'STRING', TEXT: 'TEXT',
    BOOLEAN: 'BOOLEAN', FLOAT: 'FLOAT', DECIMAL: 'DECIMAL',
    DATE: 'DATE', DATEONLY: 'DATEONLY', ENUM: jest.fn(() => 'ENUM'),
    JSON: 'JSON', BLOB: 'BLOB', BIGINT: 'BIGINT',
  },
}));

jest.mock('../models');
jest.mock('../utils/auditLogger', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

const {
  submitManagerEvaluation,
  submitSelfAssessment,
  getCheckpoint,
} = require('../controllers/evaluationController');
const models = require('../models');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a mock checkpoint with configurable period and checkpoint status,
 * due_date, and optional existing submissions.
 */
function makeCheckpoint(overrides = {}) {
  return {
    checkpoint_id:    1,
    status:           overrides.checkpointStatus  ?? 'PENDING',
    due_date:         overrides.due_date           ?? '2026-01-01',   // past date — eligible
    checkpoint_label: 'Day 30',
    probationPeriod: {
      period_id:  10,
      status:     overrides.periodStatus ?? 'ACTIVE',
      start_date: '2025-10-01',
      update:     jest.fn().mockResolvedValue([1]),   // needed for period status update
      employeeProfile: {
        profile_id: 20,
        user_id:    5,
        manager_id: 3,
      },
      checkpoints: [],
    },
    managerEvaluation: overrides.managerEvaluation ?? null,
    selfAssessment:    overrides.selfAssessment    ?? null,
    update: jest.fn().mockResolvedValue(undefined),
    toJSON: jest.fn().mockReturnValue({ checkpoint_id: 1 }),
  };
}

/** Minimal active criterion. */
function makeCriterion(id = 1, weight = 100) {
  return {
    criterion_id:  id,
    name:          `Criterion ${id}`,
    description:   '',
    weight_percent: weight,
    is_active:     true,
    display_order: id,
    toJSON: jest.fn().mockReturnValue({ criterion_id: id, name: `Criterion ${id}`, weight_percent: weight }),
  };
}

/** Build an express-style mock req for the MANAGER submission. */
function managerReq(checkpointId = '1', bodyOverrides = {}) {
  return {
    params: { checkpointId: String(checkpointId) },
    user:   { user_id: 3, role: 'LINE_MANAGER', first_name: 'Alice', last_name: 'Smith' },
    ip:     '192.168.1.1',
    socket: { remoteAddress: '127.0.0.1' },
    body: {
      scores: [{ criterion_id: 1, raw_score: 4 }],
      performance_notes: '',
      ...bodyOverrides,
    },
  };
}

/** Build a mock req for the EMPLOYEE self-assessment. */
function employeeReq(checkpointId = '1', bodyOverrides = {}) {
  return {
    params: { checkpointId: String(checkpointId) },
    user:   { user_id: 5, role: 'NEW_EMPLOYEE', first_name: 'Bob', last_name: 'Jones' },
    ip:     '10.0.0.5',
    socket: { remoteAddress: '127.0.0.1' },
    body: {
      scores: [{ criterion_id: 1, raw_score: 3 }],
      self_reflection_notes: '',
      ...bodyOverrides,
    },
  };
}

/** Capture the JSON response returned by a controller handler. */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

// ── Shared mock wiring ────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Default: EvaluationCheckpoint.findByPk returns a valid ACTIVE/eligible checkpoint
  models.EvaluationCheckpoint.findByPk = jest.fn();
  models.ManagerEvaluation.findOne     = jest.fn().mockResolvedValue(null);
  models.SelfAssessment.findOne        = jest.fn().mockResolvedValue(null);
  models.EvaluationCriterion.findAll   = jest.fn().mockResolvedValue([makeCriterion(1, 100)]);
  models.EvaluationCheckpoint.findAll  = jest.fn().mockResolvedValue([]);
  models.FinalRecommendation.count     = jest.fn().mockResolvedValue(0);
  models.FinalRecommendation.findOrCreate = jest.fn().mockResolvedValue([{}, true]);
  models.EvaluationScore.bulkCreate    = jest.fn().mockResolvedValue([]);
  models.SelfAssessmentScore.bulkCreate = jest.fn().mockResolvedValue([]);
  models.PerformanceNote.create        = jest.fn().mockResolvedValue({});
  models.SelfAssessment.create         = jest.fn().mockResolvedValue({ assessment_id: 99 });
  models.ManagerEvaluation.create      = jest.fn().mockResolvedValue({ eval_id: 50 });
  models.ProbationPeriod.update        = jest.fn().mockResolvedValue([1]);
  models.User.findAll                  = jest.fn().mockResolvedValue([]);
  models.EmployeeProfile.findByPk      = jest.fn().mockResolvedValue({ manager_id: 3 });

  // sequelize.transaction: immediately invoke the callback, passing a mock transaction.
  // G09-FIX Fix 1 added locked re-fetches inside the transaction callback which
  // access t.LOCK.UPDATE — the mock t must include a LOCK stub so those option
  // objects can be evaluated without throwing a TypeError.
  const mockDb = require('../config/database');
  const mockT = { LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } };
  mockDb.transaction = jest.fn().mockImplementation(async (cb) => cb(mockT));
});

// =============================================================================
// D1 — Period COMPLETED / CONFIRMED / DISMISSED must reject new submissions
// =============================================================================

describe('D1 — terminal period status rejects new manager evaluation', () => {
  test.each([
    ['COMPLETED'],
    ['CONFIRMED'],
    ['DISMISSED'],
  ])('TC-G09-M-%s: period %s → 409', async (periodStatus) => {
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ periodStatus })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);

    const req = managerReq();
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/probation period/i);
    expect(body.message.toLowerCase()).toContain(periodStatus.toLowerCase());
  });
});

describe('D1 — terminal period status rejects new self-assessment', () => {
  test.each([
    ['COMPLETED'],
    ['CONFIRMED'],
    ['DISMISSED'],
  ])('TC-G09-S-%s: period %s → 409', async (periodStatus) => {
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ periodStatus })
    );
    models.SelfAssessment.findOne.mockResolvedValue(null);

    const req = employeeReq();
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/probation period/i);
  });
});

// =============================================================================
// D2 — Checkpoint CANCELLED must reject new submissions
// =============================================================================

describe('D2 — CANCELLED checkpoint rejects new manager evaluation', () => {
  test('TC-G09-D2-MGR: checkpoint status CANCELLED → 409', async () => {
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ checkpointStatus: 'CANCELLED', periodStatus: 'ACTIVE' })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);

    const req = managerReq();
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/checkpoint has been cancelled/i);
  });
});

describe('D2 — CANCELLED checkpoint rejects new self-assessment', () => {
  test('TC-G09-D2-EMP: checkpoint status CANCELLED → 409', async () => {
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ checkpointStatus: 'CANCELLED', periodStatus: 'ACTIVE' })
    );
    models.SelfAssessment.findOne.mockResolvedValue(null);

    const req = employeeReq();
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/checkpoint has been cancelled/i);
  });
});

// =============================================================================
// D3 — Submission before checkpoint due_date must be rejected
// =============================================================================

describe('D3 — submission before due_date is rejected', () => {
  test('TC-G09-D3-MGR: due_date is tomorrow → manager submission rejected → 422', async () => {
    // A due_date far in the future guarantees "not yet due" in any timezone
    const futureDue = '2099-12-31';
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: futureDue })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);

    const req = managerReq();
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/not yet due/i);
    expect(body.message).toContain(futureDue);
  });

  test('TC-G09-D3-EMP: due_date in future → self-assessment rejected → 422', async () => {
    const futureDue = '2099-12-31';
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: futureDue })
    );
    models.SelfAssessment.findOne.mockResolvedValue(null);

    const req = employeeReq();
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/not yet due/i);
  });

  test('TC-G09-D3-PAST: past due_date allows submission → proceeds to score validation', async () => {
    // A checkpoint dated well in the past — should not be rejected on timing
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: '2020-01-01' })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne.mockResolvedValue(null);  // no prior self-assessment
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 5 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    // Should NOT return 422 for timing — either 201 success or a later-stage error
    if (res.status.mock.calls.length > 0) {
      expect(res.status).not.toHaveBeenCalledWith(422);
    }
  });
});

// =============================================================================
// D5 — submitSelfAssessment uses frozen criteria when manager submitted first
// =============================================================================

describe('D5 — self-assessment uses manager frozen criteria', () => {
  test('TC-G09-D5-FROZEN: criterion_id from frozen set is accepted; from global active is rejected', async () => {
    // Manager evaluated with criterion_id=1 (snapshot weight=40)
    // Global active criteria have criterion_id=2 (weight=60) — different set
    // Employee must submit scores for criterion_id=1 (the frozen set), not 2

    const frozenManagerScores = [{
      criterion_id: 1,
      weight_percent_at_scoring: '40.00',
    }];
    const managerEvalMock = {
      eval_id: 50,
      scores:  frozenManagerScores,
    };

    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: '2020-01-01' })
    );
    models.SelfAssessment.findOne.mockResolvedValue(null);
    // submitSelfAssessment: dup-check is on SelfAssessment (→ null above).
    // The freeze check calls ManagerEvaluation.findOne once → managerEvalMock.
    models.ManagerEvaluation.findOne.mockResolvedValue(managerEvalMock);

    // EvaluationCriterion.findAll is called with the frozen criterion ids
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 40)]);

    // Employee submits scores for criterion_id=1 (correct — matches frozen set)
    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 3 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);

    // Should succeed (201)
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('TC-G09-D5-WRONG-CRIT: score for a criterion not in the frozen set is rejected', async () => {
    const frozenManagerScores = [{ criterion_id: 1, weight_percent_at_scoring: '100.00' }];
    const managerEvalMock = { eval_id: 50, scores: frozenManagerScores };

    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: '2020-01-01' })
    );
    models.SelfAssessment.findOne.mockResolvedValue(null);
    // Single call to ManagerEvaluation.findOne in submitSelfAssessment → freeze lookup
    models.ManagerEvaluation.findOne.mockResolvedValue(managerEvalMock);

    // frozen criteria list returns criterion 1 (not 99)
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    // Employee submits for criterion_id=99 — not in the frozen set
    const req = employeeReq('1', { scores: [{ criterion_id: 99, raw_score: 4 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    // Controller: "Must match the frozen criteria for this checkpoint."
    expect(body.message).toMatch(/frozen criteria for this checkpoint/i);
  });
});

// =============================================================================
// D6 — submitManagerEvaluation uses frozen criteria when employee submitted first
// =============================================================================

describe('D6 — manager evaluation uses employee frozen criteria', () => {
  test('TC-G09-D6-FROZEN: criterion from frozen employee set is accepted', async () => {
    const frozenEmployeeScores = [{ criterion_id: 1, weight_percent_at_scoring: '100.00' }];
    const selfAssessmentMock = { assessment_id: 99, scores: frozenEmployeeScores };

    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: '2020-01-01' })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null); // no duplicate
    models.SelfAssessment.findOne.mockResolvedValue(selfAssessmentMock); // employee went first
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 5 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('TC-G09-D6-WRONG-CRIT: criterion not in frozen employee set is rejected', async () => {
    const frozenEmployeeScores = [{ criterion_id: 1, weight_percent_at_scoring: '100.00' }];
    const selfAssessmentMock = { assessment_id: 99, scores: frozenEmployeeScores };

    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: '2020-01-01' })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne.mockResolvedValue(selfAssessmentMock);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    // Manager submits for criterion_id=99 — not in the frozen set
    const req = managerReq('1', { scores: [{ criterion_id: 99, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    // Controller: "Must match the frozen criteria for this checkpoint."
    expect(body.message).toMatch(/frozen criteria for this checkpoint/i);
  });
});

// =============================================================================
// D7 — getIp must use req.ip, not X-Forwarded-For header
// =============================================================================

describe('D7 — audit log uses req.ip (trust-proxy value), not X-Forwarded-For', () => {
  test('TC-G09-D7-MGR: req.ip is used; X-Forwarded-For header is ignored', async () => {
    const { createAuditLog } = require('../utils/auditLogger');

    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ due_date: '2020-01-01' })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 5 }] });
    // Forge a different IP via the header — should be ignored
    req.headers = { 'x-forwarded-for': '10.10.10.10' };
    req.ip = '192.168.1.1';  // This is what Express derives after trust proxy

    const res = mockRes();
    await submitManagerEvaluation(req, res);

    // The audit log should use '192.168.1.1' (from req.ip), not '10.10.10.10'
    const auditCalls = createAuditLog.mock.calls;
    expect(auditCalls.length).toBeGreaterThan(0);
    const lastCall = auditCalls[auditCalls.length - 1][0];
    expect(lastCall.ipAddress).toBe('192.168.1.1');
    expect(lastCall.ipAddress).not.toBe('10.10.10.10');
  });
});

// =============================================================================
// Guard: existing G07 CANCELLED period check still works (non-regression)
// =============================================================================

describe('G07 regression — CANCELLED period check preserved', () => {
  test('TC-G09-REG-MGR: period CANCELLED → 409 with cancelled message', async () => {
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ periodStatus: 'CANCELLED' })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);

    const res = mockRes();
    await submitManagerEvaluation(managerReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toMatch(/cancelled/i);
  });

  test('TC-G09-REG-EMP: period CANCELLED → 409 with cancelled message', async () => {
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ periodStatus: 'CANCELLED' })
    );
    models.SelfAssessment.findOne.mockResolvedValue(null);

    const res = mockRes();
    await submitSelfAssessment(employeeReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toMatch(/cancelled/i);
  });
});

// =============================================================================
// Guard: EXTENDED period still accepts submissions (non-regression)
// =============================================================================

describe('Non-regression — EXTENDED period still accepts submissions', () => {
  test('TC-G09-EXT-MGR: period EXTENDED + past due_date → submission allowed', async () => {
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(
      makeCheckpoint({ periodStatus: 'EXTENDED', due_date: '2020-01-01' })
    );
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// =============================================================================
// Fix 1 — Atomic duplicate guard inside the Sequelize transaction
//
// A second concurrent request can pass the outer fast-path duplicate check
// (ManagerEvaluation.findOne returns null) before the first commit.  The
// locked re-fetch inside the transaction catches this and returns 409 without
// a 500 internal error.
// =============================================================================

describe('Fix 1 — atomic duplicate guard prevents race-condition double-submit', () => {
  test('TC-G09-F1-MGR: outer check passes but inner locked check detects duplicate → 409 (not 500)', async () => {
    // Simulate: first submitter already committed between the outer findOne check
    // and the locked findOne inside the transaction.
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)   // 1st call: outer load with includes
      .mockResolvedValueOnce(cp);  // 2nd call: locked re-fetch inside transaction

    models.ManagerEvaluation.findOne
      .mockResolvedValueOnce(null)                    // outer fast-path: no duplicate yet
      .mockResolvedValueOnce({ eval_id: 50 });        // inner atomic check: race detected

    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/already submitted/i);
    // Must NOT return 500 — EligibilityError is handled before the generic catch
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test('TC-G09-F1-EMP: outer check passes but inner locked check detects duplicate → 409 (not 500)', async () => {
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)   // outer load
      .mockResolvedValueOnce(cp);  // inner locked re-fetch inside transaction

    // submitSelfAssessment calls SelfAssessment.findOne twice:
    //   1st: outer fast-path duplicate check   → null (passes)
    //   2nd: inside transaction atomic check   → existing assessment (race!)
    models.SelfAssessment.findOne
      .mockResolvedValueOnce(null)                       // outer fast-path
      .mockResolvedValueOnce({ assessment_id: 99 });     // inner atomic check: race

    // ManagerEvaluation.findOne: freeze check → no manager yet
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 3 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/already submitted/i);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});

// =============================================================================
// Fix 3 — name_at_scoring populated in score rows
//
// The criterion name must be captured at submission time so that renaming
// a criterion in the System Administrator configuration does not change
// labels on historical evaluation records and PDF reports (FR-14).
// =============================================================================

describe('Fix 3 — name_at_scoring saved in EvaluationScore rows at submission time', () => {
  test('TC-G09-F3-MGR: EvaluationScore.bulkCreate called with name_at_scoring set', async () => {
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);

    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 5 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    // Verify EvaluationScore.bulkCreate was called with name_at_scoring populated
    expect(models.EvaluationScore.bulkCreate).toHaveBeenCalled();
    const bulkArg = models.EvaluationScore.bulkCreate.mock.calls[0][0];
    expect(Array.isArray(bulkArg)).toBe(true);
    expect(bulkArg.length).toBeGreaterThan(0);
    // Every score row must carry a name_at_scoring value (not undefined/null for a named criterion)
    bulkArg.forEach((row) => {
      expect(row).toHaveProperty('name_at_scoring');
      // makeCriterion gives name 'Criterion 1' — should be captured
      expect(row.name_at_scoring).toBe('Criterion 1');
    });
  });

  test('TC-G09-F3-EMP: SelfAssessmentScore.bulkCreate called with name_at_scoring set', async () => {
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);

    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(models.SelfAssessmentScore.bulkCreate).toHaveBeenCalled();
    const bulkArg = models.SelfAssessmentScore.bulkCreate.mock.calls[0][0];
    expect(Array.isArray(bulkArg)).toBe(true);
    expect(bulkArg.length).toBeGreaterThan(0);
    bulkArg.forEach((row) => {
      expect(row).toHaveProperty('name_at_scoring');
      expect(row.name_at_scoring).toBe('Criterion 1');
    });
  });
});

// =============================================================================
// Fix 4 — Frozen-criteria enforcement with non-NULL weights
//
// When the first submitter's score snapshot has non-NULL weight_percent_at_scoring
// the second submitter must be validated against those frozen criterion IDs.
// A criterion ID not in the snapshot is rejected 400; the frozen criterion ID
// is accepted and produces 201.
//
// (Pre-G09 NULL-weight snapshots are covered separately in Fix 3c where they
// produce 422 UNRESOLVED_WEIGHT_HISTORY before criterion validation is reached.)
// =============================================================================

describe('Fix 4 — Frozen-criteria enforcement (non-NULL weight snapshot)', () => {
  test('TC-G09-F4-MGR: employee snapshot has non-NULL weights → manager must submit for snapshot criterion ID (1), not a different active criterion (2)', async () => {
    // Employee self-assessment has criterion_id=1 with a known weight.
    // weight_percent_at_scoring is non-NULL so the NULL-weight guard is not triggered
    // and criterion ID validation is reached.
    const frozenScores = [{
      criterion_id:              1,
      weight_percent_at_scoring: 100,   // non-NULL — criterion freeze path
      name_at_scoring:           null,
    }];
    const selfAssessmentMock = { assessment_id: 99, scores: frozenScores };

    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);

    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne.mockResolvedValue(selfAssessmentMock);
    // findAll called with { where: { criterion_id: [1] } } returns criterion 1
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    // Manager submits for criterion_id=2 — not in the snapshot — must be REJECTED
    const reqBad = managerReq('1', { scores: [{ criterion_id: 2, raw_score: 4 }] });
    const resBad = mockRes();
    await submitManagerEvaluation(reqBad, resBad);
    expect(resBad.status).toHaveBeenCalledWith(400);

    // Reset mocks and confirm criterion_id=1 is accepted
    jest.clearAllMocks();
    const cp2 = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp2)
      .mockResolvedValueOnce(cp2);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne
      .mockResolvedValueOnce(selfAssessmentMock) // freeze check inside txn
      .mockResolvedValueOnce({ assessment_id: 99 }); // selfAssessmentDone check
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);
    models.ManagerEvaluation.create.mockResolvedValue({ eval_id: 10 });
    models.EvaluationScore.bulkCreate.mockResolvedValue([]);
    models.EvaluationCheckpoint.update.mockResolvedValue([1]);
    models.AuditLog.create.mockResolvedValue({});
    models.Notification.create.mockResolvedValue({});

    const reqGood = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }] });
    const resGood = mockRes();
    await submitManagerEvaluation(reqGood, resGood);
    expect(resGood.status).toHaveBeenCalledWith(201);
  });

  test('TC-G09-F4-EMP: manager snapshot has non-NULL weights → employee must submit for snapshot criterion ID (1), not a different active criterion (2)', async () => {
    // Manager evaluation has criterion_id=1 with a known weight.
    // weight_percent_at_scoring is non-NULL so the NULL-weight guard is not triggered
    // and criterion ID validation is reached.
    const frozenScores = [{
      criterion_id:              1,
      weight_percent_at_scoring: 100,   // non-NULL — criterion freeze path
      name_at_scoring:           null,
    }];
    const managerEvalMock = { eval_id: 50, scores: frozenScores };

    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);

    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.ManagerEvaluation.findOne.mockResolvedValue(managerEvalMock);
    // findAll called with { where: { criterion_id: [1] } } returns criterion 1
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    // Employee submits for criterion_id=2 — not in the snapshot — must be REJECTED
    const reqBad = employeeReq('1', { scores: [{ criterion_id: 2, raw_score: 3 }] });
    const resBad = mockRes();
    await submitSelfAssessment(reqBad, resBad);
    expect(resBad.status).toHaveBeenCalledWith(400);

    // Reset mocks and confirm criterion_id=1 is accepted
    jest.clearAllMocks();
    const cp2 = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp2)
      .mockResolvedValueOnce(cp2);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.ManagerEvaluation.findOne
      .mockResolvedValueOnce(managerEvalMock) // freeze check inside txn
      .mockResolvedValueOnce(managerEvalMock); // managerDone check
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);
    models.SelfAssessment.create.mockResolvedValue({ assessment_id: 20 });
    models.SelfAssessmentScore.bulkCreate.mockResolvedValue([]);
    models.EvaluationCheckpoint.update.mockResolvedValue([1]);
    models.AuditLog.create.mockResolvedValue({});
    models.Notification.create.mockResolvedValue({});

    const reqGood = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 3 }] });
    const resGood = mockRes();
    await submitSelfAssessment(reqGood, resGood);
    expect(resGood.status).toHaveBeenCalledWith(201);
  });
});

// =============================================================================
// Fix 5 — Score payload validation
//
// Invalid score values (fractional, NaN, negative, duplicate criterion_ids)
// must be rejected with 400 before any database write, so they cannot produce
// NaN contributions, inflated totals, or conflicting records (FR-14).
// =============================================================================

describe('Fix 5 — score payload validation rejects invalid inputs', () => {
  // Shared setup: eligible checkpoint, no prior submissions, active criteria
  function eligibleSetup() {
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(cp);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.EvaluationCriterion.findAll.mockResolvedValue([
      makeCriterion(1, 50),
      makeCriterion(2, 50),
    ]);
  }

  test('TC-G09-F5-FRAC-MGR: fractional raw_score → 400', async () => {
    eligibleSetup();
    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 3.5 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/whole number/i);
  });

  test('TC-G09-F5-NAN-MGR: non-numeric raw_score → 400', async () => {
    eligibleSetup();
    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 'abc' }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/whole number/i);
  });

  test('TC-G09-F5-DUP-MGR: duplicate criterion_id → 400', async () => {
    eligibleSetup();
    const req = managerReq('1', {
      scores: [
        { criterion_id: 1, raw_score: 4 },
        { criterion_id: 1, raw_score: 5 },   // duplicate
      ],
    });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/duplicate criterion_id/i);
  });

  test('TC-G09-F5-NEG-MGR: negative criterion_id → 400', async () => {
    eligibleSetup();
    const req = managerReq('1', { scores: [{ criterion_id: -1, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/positive integer/i);
  });

  test('TC-G09-F5-FRAC-EMP: fractional raw_score in self-assessment → 400', async () => {
    eligibleSetup();
    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 2.7 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/whole number/i);
  });

  test('TC-G09-F5-DUP-EMP: duplicate criterion_id in self-assessment → 400', async () => {
    eligibleSetup();
    const req = employeeReq('1', {
      scores: [
        { criterion_id: 1, raw_score: 3 },
        { criterion_id: 1, raw_score: 4 },   // duplicate
      ],
    });
    const res = mockRes();
    await submitSelfAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/duplicate criterion_id/i);
  });

  test('TC-G09-F5-VALID: valid integer scores are accepted → 201', async () => {
    // Positive control: a submission with two valid integer scores must pass validation
    eligibleSetup();
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    const req = managerReq('1', {
      scores: [
        { criterion_id: 1, raw_score: 4 },
        { criterion_id: 2, raw_score: 5 },
      ],
    });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    // No 400 errors
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  // ── Issue 3: array coercion and null scores ──────────────────────────────

  test('TC-G09-F5-NULL-MGR: scores=null → 400 (not 500)', async () => {
    eligibleSetup();
    const req = managerReq('1', { scores: null });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/scores must be an array/i);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test('TC-G09-F5-NULL-EMP: scores=null in self-assessment → 400 (not 500)', async () => {
    eligibleSetup();
    const req = employeeReq('1', { scores: null });
    const res = mockRes();
    await submitSelfAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/scores must be an array/i);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test('TC-G09-F5-ARR-RAW-MGR: raw_score=[5] (array) → 400', async () => {
    eligibleSetup();
    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: [5] }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/booleans or arrays/i);
  });

  test('TC-G09-F5-ARR-CID-MGR: criterion_id=[1] (array) → 400', async () => {
    eligibleSetup();
    const req = managerReq('1', { scores: [{ criterion_id: [1], raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/booleans or arrays/i);
  });

  test('TC-G09-F5-ARR-RAW-EMP: raw_score=[5] (array) in self-assessment → 400', async () => {
    eligibleSetup();
    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: [5] }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/booleans or arrays/i);
  });

  test('TC-G09-F5-ARR-CID-EMP: criterion_id=[1] (array) in self-assessment → 400', async () => {
    eligibleSetup();
    const req = employeeReq('1', { scores: [{ criterion_id: [1], raw_score: 3 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toMatch(/booleans or arrays/i);
  });
});

// =============================================================================
// Fix 3b — name carry-through from first-submitter snapshot (Issue 2)
//
// When the first submitter's snapshot has a name_at_scoring value, the second
// submission must carry that same name into its own score rows so that criterion
// renames after the first submission do not corrupt the second submission's label.
// FR-14 — historical scoring data must remain consistent across both submissions.
// =============================================================================

describe('Fix 3b — name_at_scoring carried from first-submitter snapshot', () => {
  /**
   * Snapshot with a frozen name and non-NULL weight so that the NULL-weight guard
   * is not triggered and the name carry-through test reaches bulkCreate (FR-14).
   * With the new policy, NULL weight → 422 before name validation is checked.
   */
  function makeNamedSnapshot(frozenName) {
    return [{
      criterion_id:              1,
      weight_percent_at_scoring: 100,           // non-NULL: NULL-weight guard bypassed
      name_at_scoring:           frozenName,
    }];
  }

  test('TC-G09-F3B-MGR: manager uses employee frozen name ("Quality") even after criterion renamed', async () => {
    // Employee submitted first with criterion named "Quality".
    // The criterion has since been renamed to "Renamed after first submission".
    const selfAssessmentMock = { assessment_id: 99, scores: makeNamedSnapshot('Quality') };

    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne
      .mockResolvedValueOnce(selfAssessmentMock)   // outer fast-path
      .mockResolvedValueOnce(selfAssessmentMock)   // inner freeze check
      .mockResolvedValueOnce({ assessment_id: 99 }); // selfAssessmentDone check
    // Current name on the criterion is "Renamed after first submission"
    const renamedCriterion = {
      criterion_id:   1,
      name:           'Renamed after first submission',
      weight_percent: 100,
      is_active:      true,
      toJSON: jest.fn().mockReturnValue({
        criterion_id:   1,
        name:           'Renamed after first submission',
        weight_percent: 100,
      }),
    };
    models.EvaluationCriterion.findAll.mockResolvedValue([renamedCriterion]);
    models.ManagerEvaluation.create.mockResolvedValue({ eval_id: 10 });
    models.EvaluationScore.bulkCreate.mockResolvedValue([]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.EvaluationScore.bulkCreate).toHaveBeenCalled();
    const bulkArg = models.EvaluationScore.bulkCreate.mock.calls[0][0];
    expect(bulkArg[0].name_at_scoring).toBe('Quality');
    // Must NOT store the post-rename name
    expect(bulkArg[0].name_at_scoring).not.toBe('Renamed after first submission');
  });

  test('TC-G09-F3B-EMP: employee uses manager frozen name ("Quality") even after criterion renamed', async () => {
    const managerEvalMock = { eval_id: 50, scores: makeNamedSnapshot('Quality') };

    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.ManagerEvaluation.findOne
      .mockResolvedValueOnce(managerEvalMock)   // outer fast-path
      .mockResolvedValueOnce(managerEvalMock)   // inner freeze check
      .mockResolvedValueOnce(managerEvalMock);  // managerDone check
    const renamedCriterion = {
      criterion_id:   1,
      name:           'Renamed after first submission',
      weight_percent: 100,
      is_active:      true,
      toJSON: jest.fn().mockReturnValue({
        criterion_id:   1,
        name:           'Renamed after first submission',
        weight_percent: 100,
      }),
    };
    models.EvaluationCriterion.findAll.mockResolvedValue([renamedCriterion]);
    models.SelfAssessment.create.mockResolvedValue({ assessment_id: 20 });
    models.SelfAssessmentScore.bulkCreate.mockResolvedValue([]);

    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 3 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.SelfAssessmentScore.bulkCreate).toHaveBeenCalled();
    const bulkArg = models.SelfAssessmentScore.bulkCreate.mock.calls[0][0];
    expect(bulkArg[0].name_at_scoring).toBe('Quality');
    expect(bulkArg[0].name_at_scoring).not.toBe('Renamed after first submission');
  });
});

// =============================================================================
// Fix 3c — legacy-weight handling (Issue 1)
//
// NULL weight_percent_at_scoring means a pre-G09 row where the original weight
// was not snapshotted.  Recovering the weight via (contribution × 5) / raw_score
// is unreliable: weighted_contribution is stored as a rounded decimal, so
// inversion introduces rounding error.  The 68.74 / 31.26 example illustrates
// this:
//
//   original weights: 68.74 %, 31.26 %
//   contributions at 1 dp: (4/5)×68.74 = 54.992 → stored as 55.0
//                           (4/5)×31.26 = 25.008 → stored as 25.0
//   inversion:   (55.0×5)/4 = 68.75  ≠ 68.74
//                (25.0×5)/4 = 31.25  ≠ 31.26
//
// The system must reject any second submission where ANY score has NULL
// weight_percent_at_scoring, returning 422 UNRESOLVED_WEIGHT_HISTORY.
// The getCheckpoint endpoint must expose hasUnresolvableWeightHistory:true so
// the frontend can warn the reviewer before the second submission is attempted.
//
// Non-NULL weight_percent_at_scoring rows are unaffected — the stored value is
// used exactly as-is (no inversion, no rounding).
//
// FR-14 — historical scoring data must remain consistent.
// =============================================================================

describe('Fix 3c — legacy-weight handling: NULL weight_percent_at_scoring → 422', () => {

  test('TC-G09-F3C-NULL-MGR: NULL weight_percent_at_scoring → 422 (UNRESOLVED_WEIGHT_HISTORY) regardless of other fields', async () => {
    // Employee snapshot with NULL weight (pre-G09 row).  Inversion is not attempted.
    const selfAssessmentMock = {
      assessment_id: 99,
      scores: [{
        criterion_id:              1,
        weight_percent_at_scoring: null,  // pre-G09: no snapshot
        name_at_scoring:           null,
      }],
    };
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne
      .mockResolvedValueOnce(selfAssessmentMock)
      .mockResolvedValueOnce(selfAssessmentMock);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].message).toMatch(/unresolved weight history/i);
    expect(res.json.mock.calls[0][0].code).toBe('UNRESOLVED_WEIGHT_HISTORY');
    expect(res.status).not.toHaveBeenCalledWith(500);
    // Must not reach bulkCreate
    expect(models.EvaluationScore.bulkCreate).not.toHaveBeenCalled();
  });

  test('TC-G09-F3C-NULL-EMP: NULL weight_percent_at_scoring → 422 (UNRESOLVED_WEIGHT_HISTORY) regardless of other fields', async () => {
    const managerEvalMock = {
      eval_id: 50,
      scores: [{
        criterion_id:              1,
        weight_percent_at_scoring: null,  // pre-G09: no snapshot
        name_at_scoring:           null,
      }],
    };
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.ManagerEvaluation.findOne
      .mockResolvedValueOnce(managerEvalMock)
      .mockResolvedValueOnce(managerEvalMock);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 3 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].message).toMatch(/unresolved weight history/i);
    expect(res.json.mock.calls[0][0].code).toBe('UNRESOLVED_WEIGHT_HISTORY');
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(models.SelfAssessmentScore.bulkCreate).not.toHaveBeenCalled();
  });

  test('TC-G09-F3C-MIX-MGR: mixed NULL/non-NULL snapshot → 422 (entire snapshot is unresolvable)', async () => {
    // Even if one criterion has a valid weight, ANY NULL makes the whole snapshot
    // unresolvable — a partial recovery would produce inconsistent results.
    const selfAssessmentMock = {
      assessment_id: 99,
      scores: [
        { criterion_id: 1, weight_percent_at_scoring: 70,   name_at_scoring: null },  // OK
        { criterion_id: 2, weight_percent_at_scoring: null, name_at_scoring: null },  // NULL
      ],
    };
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne
      .mockResolvedValueOnce(selfAssessmentMock)
      .mockResolvedValueOnce(selfAssessmentMock);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 70), makeCriterion(2, 30)]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }, { criterion_id: 2, raw_score: 3 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].code).toBe('UNRESOLVED_WEIGHT_HISTORY');
    expect(models.EvaluationScore.bulkCreate).not.toHaveBeenCalled();
  });

  test('TC-G09-F3C-MIX-EMP: mixed NULL/non-NULL manager snapshot → 422 (entire snapshot is unresolvable)', async () => {
    const managerEvalMock = {
      eval_id: 50,
      scores: [
        { criterion_id: 1, weight_percent_at_scoring: 70,   name_at_scoring: null },
        { criterion_id: 2, weight_percent_at_scoring: null, name_at_scoring: null },
      ],
    };
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.SelfAssessment.findOne.mockResolvedValue(null);
    models.ManagerEvaluation.findOne
      .mockResolvedValueOnce(managerEvalMock)
      .mockResolvedValueOnce(managerEvalMock);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 70), makeCriterion(2, 30)]);

    const req = employeeReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }, { criterion_id: 2, raw_score: 3 }] });
    const res = mockRes();
    await submitSelfAssessment(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].code).toBe('UNRESOLVED_WEIGHT_HISTORY');
    expect(models.SelfAssessmentScore.bulkCreate).not.toHaveBeenCalled();
  });

  test('TC-G09-F3C-AMBIG-MGR: 68.74/31.26 ambiguous-rounding case → 422, no inversion guess', async () => {
    // Demonstrates the rounding problem: contributions stored at 1 dp give
    // 55.0 and 25.0.  Inversion would produce 68.75 and 31.25 — different from the
    // original 68.74 and 31.26.  The system must reject rather than guess.
    const selfAssessmentMock = {
      assessment_id: 99,
      scores: [
        { criterion_id: 1, weight_percent_at_scoring: null, name_at_scoring: null },
        { criterion_id: 2, weight_percent_at_scoring: null, name_at_scoring: null },
      ],
    };
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne
      .mockResolvedValueOnce(selfAssessmentMock)
      .mockResolvedValueOnce(selfAssessmentMock);
    models.EvaluationCriterion.findAll.mockResolvedValue([
      makeCriterion(1, 68.74),
      makeCriterion(2, 31.26),
    ]);

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }, { criterion_id: 2, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    // Must be UNRESOLVED_WEIGHT_HISTORY — not an attempt to invert rounded contributions
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].code).toBe('UNRESOLVED_WEIGHT_HISTORY');
    expect(models.EvaluationScore.bulkCreate).not.toHaveBeenCalled();
  });

  test('TC-G09-F3C-PRESERVED-MGR: non-NULL weights (68.74 / 31.26) used exactly — not rounded by inversion', async () => {
    // A post-G09 snapshot stores the original weights directly.  They must be passed
    // through unchanged — no inversion, no rounding.
    const selfAssessmentMock = {
      assessment_id: 99,
      scores: [
        { criterion_id: 1, weight_percent_at_scoring: 68.74, name_at_scoring: null },
        { criterion_id: 2, weight_percent_at_scoring: 31.26, name_at_scoring: null },
      ],
    };
    const cp = makeCheckpoint({ due_date: '2020-01-01' });
    models.EvaluationCheckpoint.findByPk
      .mockResolvedValueOnce(cp)
      .mockResolvedValueOnce(cp);
    models.ManagerEvaluation.findOne.mockResolvedValue(null);
    models.SelfAssessment.findOne
      .mockResolvedValueOnce(selfAssessmentMock)   // outer fast-path
      .mockResolvedValueOnce(selfAssessmentMock)   // inner freeze check
      .mockResolvedValueOnce({ assessment_id: 99 }); // selfAssessmentDone
    models.EvaluationCriterion.findAll.mockResolvedValue([
      makeCriterion(1, 68.74),
      makeCriterion(2, 31.26),
    ]);
    models.ManagerEvaluation.create.mockResolvedValue({ eval_id: 10 });
    models.EvaluationScore.bulkCreate.mockResolvedValue([]);
    models.EvaluationCheckpoint.update.mockResolvedValue([1]);
    models.AuditLog.create.mockResolvedValue({});
    models.Notification.create.mockResolvedValue({});

    const req = managerReq('1', { scores: [{ criterion_id: 1, raw_score: 4 }, { criterion_id: 2, raw_score: 4 }] });
    const res = mockRes();
    await submitManagerEvaluation(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const bulkArg = models.EvaluationScore.bulkCreate.mock.calls[0][0];
    const c1Row = bulkArg.find((r) => r.criterion_id === 1);
    const c2Row = bulkArg.find((r) => r.criterion_id === 2);
    expect(c1Row.weight_percent_at_scoring).toBe(68.74);  // exact original, not 68.75
    expect(c2Row.weight_percent_at_scoring).toBe(31.26);  // exact original, not 31.25
  });

  test('TC-G09-F3C-GET-UNR: getCheckpoint with NULL snapshot weight → hasUnresolvableWeightHistory:true', async () => {
    // The GET endpoint must expose the flag so the frontend can warn the reviewer
    // before the second submission is attempted (consistency with submission 422).
    const scoreWithNullWeight = {
      criterion_id:              1,
      weight_percent_at_scoring: null,  // pre-G09 row
      name_at_scoring:           null,
      raw_score:                 4,
      weighted_contribution:     80,
      criterion: { criterion_id: 1, name: 'Criterion 1', description: '', weight_percent: 100 },
    };
    const cpWithMgrEval = makeCheckpoint({
      due_date: '2020-01-01',
      managerEvaluation: {
        eval_id:    50,
        scores:     [scoreWithNullWeight],
        toJSON:     jest.fn().mockReturnValue({ eval_id: 50, scores: [scoreWithNullWeight] }),
      },
    });
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(cpWithMgrEval);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    // HR_ADMIN role bypasses access control
    const req = {
      params: { checkpointId: '1' },
      user:   { user_id: 1, role: 'HR_ADMIN' },
    };
    const res = mockRes();
    await getCheckpoint(req, res);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.hasUnresolvableWeightHistory).toBe(true);
  });

  test('TC-G09-F3C-GET-OK: getCheckpoint with non-NULL snapshot weight → hasUnresolvableWeightHistory:false', async () => {
    // A post-G09 checkpoint with valid weight_percent_at_scoring should NOT be flagged.
    const scoreWithWeight = {
      criterion_id:              1,
      weight_percent_at_scoring: 100,  // post-G09 row
      name_at_scoring:           null,
      raw_score:                 4,
      weighted_contribution:     80,
      criterion: { criterion_id: 1, name: 'Criterion 1', description: '', weight_percent: 100 },
    };
    const cpWithMgrEval = makeCheckpoint({
      due_date: '2020-01-01',
      managerEvaluation: {
        eval_id:    50,
        scores:     [scoreWithWeight],
        toJSON:     jest.fn().mockReturnValue({ eval_id: 50, scores: [scoreWithWeight] }),
      },
    });
    models.EvaluationCheckpoint.findByPk.mockResolvedValue(cpWithMgrEval);
    models.EvaluationCriterion.findAll.mockResolvedValue([makeCriterion(1, 100)]);

    const req = {
      params: { checkpointId: '1' },
      user:   { user_id: 1, role: 'HR_ADMIN' },
    };
    const res = mockRes();
    await getCheckpoint(req, res);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.hasUnresolvableWeightHistory).toBe(false);
  });
});
