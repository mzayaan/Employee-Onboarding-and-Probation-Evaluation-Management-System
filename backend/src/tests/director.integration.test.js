// =============================================================================
// src/tests/director.integration.test.js
// Supertest integration tests for the three-stage probation approval workflow.
//
// Routes under test:  /api/director/*  (directorRoutes.js + directorController.js)
//
// Stages covered:
//   Stage 2  — HR reviews:   endorse (→ PENDING_DIRECTOR) or
//                             return  (→ RETURNED_TO_MANAGER)
//   Stage 2b — Manager resubmits (→ PENDING_HR_REVIEW)
//   Stage 3  — Director decides: approve (→ APPROVED) or return (→ RETURNED_TO_MANAGER)
//
// All Sequelize models are mocked; no live database is required.
//
// Requirements: FR-15, FR-20 | NFR-02, NFR-03 | Objective 3
// Test cases: TC-DIR-001 through TC-DIR-022
// =============================================================================

// ── Dependency mocks (must be declared before any require()) ─────────────────
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

// ---------------------------------------------------------------------------
// Mock the notification service — prevents real DB calls in fire-and-forget
// ---------------------------------------------------------------------------
jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Mock the audit logger — prevents real DB calls
// ---------------------------------------------------------------------------
jest.mock('../utils/auditLogger', () => ({
  createAuditLog: jest.fn().mockResolvedValue({}),
}));

// ---------------------------------------------------------------------------
// Central Sequelize models mock
// Every route in directorController.js that needs a model will get these fakes.
// ---------------------------------------------------------------------------
const makeMockRec = (override = {}) => ({
  rec_id:             10,
  approval_status:    'PENDING_HR_REVIEW',
  recommendation_type:'CONFIRM',
  cumulative_score:   78.5,
  generated_at:       new Date('2026-09-01'),
  submitted_by:       5,        // LINE_MANAGER user_id
  endorsed_by:        null,
  endorsed_at:        null,
  hr_endorsement_notes: null,
  submitted_to_director_at: null,
  director_id:        null,
  director_decision_at: null,
  director_reason:    null,
  rejection_count:    0,
  probationPeriod:    {
    period_id: 1,
    status:    'ACTIVE',
    end_date:  new Date('2026-10-01'),
    update:    jest.fn().mockResolvedValue(true),
  },
  update: jest.fn().mockResolvedValue(true),
  ...override,
});

const mockHRUser = {
  user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
  first_name: 'Jane', last_name: 'Doe', is_active: true,
  toJSON: jest.fn().mockReturnValue({
    user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
    first_name: 'Jane', last_name: 'Doe',
  }),
};

const mockDirectorUser = {
  user_id: 20, email: 'director@company.com', role: 'DIRECTOR',
  first_name: 'David', last_name: 'Chen', is_active: true,
  toJSON: jest.fn().mockReturnValue({
    user_id: 20, email: 'director@company.com', role: 'DIRECTOR',
    first_name: 'David', last_name: 'Chen',
  }),
};

const mockManagerUser = {
  user_id: 5, email: 'mgr@company.com', role: 'LINE_MANAGER',
  first_name: 'Tom', last_name: 'Jones', is_active: true,
  toJSON: jest.fn().mockReturnValue({
    user_id: 5, email: 'mgr@company.com', role: 'LINE_MANAGER',
    first_name: 'Tom', last_name: 'Jones',
  }),
};

// The sequelize.transaction helper used in approveRecommendation
const mockTransaction = jest.fn().mockImplementation(async (cb) => {
  await cb({ /* fake transaction handle */ });
});

jest.mock('../models', () => {
  return {
    sequelize: {
      authenticate: jest.fn().mockResolvedValue(undefined),
      transaction:  mockTransaction,
    },
    User: {
      findOne:  jest.fn().mockResolvedValue(mockHRUser),
      findByPk: jest.fn().mockResolvedValue(mockHRUser),
      findAll:  jest.fn().mockResolvedValue([]),   // for notifyHR / notifyDirectors
    },
    FinalRecommendation: {
      findByPk: jest.fn(),
      findAll:  jest.fn().mockResolvedValue([]),
    },
    ProbationPeriod: {
      findByPk: jest.fn(),
    },
    EmployeeProfile: {
      findByPk: jest.fn(),
    },
    Department: {
      findAll: jest.fn().mockResolvedValue([]),
    },
    AuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    EvaluationCriterion: {
      findAll: jest.fn().mockResolvedValue([]),
    },
  };
});

// ── Imports (after all mocks are declared) ────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const { User, FinalRecommendation } = require('../models');

// ── Helpers ──────────────────────────────────────────────────────────────────
const token = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

const hrToken  = token({ user_id: 1,  email: 'hr@company.com',       role: 'HR_ADMIN',     first_name: 'Jane',  last_name: 'Doe'  });
const dirToken = token({ user_id: 20, email: 'director@company.com', role: 'DIRECTOR',     first_name: 'David', last_name: 'Chen' });
const mgrToken = token({ user_id: 5,  email: 'mgr@company.com',      role: 'LINE_MANAGER', first_name: 'Tom',   last_name: 'Jones' });
const empToken = token({ user_id: 9,  email: 'emp@company.com',      role: 'NEW_EMPLOYEE', first_name: 'Alice', last_name: 'Lee'  });

// =============================================================================
// RBAC — queue endpoint access control
// =============================================================================

describe('RBAC — /api/director/* access control (FR-20 | NFR-03)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    FinalRecommendation.findAll.mockResolvedValue([]);
  });

  // ── TC-DIR-001 ──────────────────────────────────────────────────────────────
  test('TC-DIR-001: HR_ADMIN can access /pending-hr → 200', async () => {
    User.findOne.mockResolvedValue(mockHRUser);

    const res = await request(app)
      .get('/api/director/pending-hr')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── TC-DIR-002 ──────────────────────────────────────────────────────────────
  test('TC-DIR-002: DIRECTOR cannot access /pending-hr → 403', async () => {
    User.findOne.mockResolvedValue(mockDirectorUser);

    const res = await request(app)
      .get('/api/director/pending-hr')
      .set('Authorization', `Bearer ${dirToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── TC-DIR-003 ──────────────────────────────────────────────────────────────
  test('TC-DIR-003: DIRECTOR can access /pending-director → 200', async () => {
    User.findOne.mockResolvedValue(mockDirectorUser);

    const res = await request(app)
      .get('/api/director/pending-director')
      .set('Authorization', `Bearer ${dirToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ── TC-DIR-004 ──────────────────────────────────────────────────────────────
  test('TC-DIR-004: HR_ADMIN cannot access /pending-director → 403', async () => {
    User.findOne.mockResolvedValue(mockHRUser);

    const res = await request(app)
      .get('/api/director/pending-director')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ── TC-DIR-005 ──────────────────────────────────────────────────────────────
  test('TC-DIR-005: unauthenticated request to any director route → 401', async () => {
    const res = await request(app).get('/api/director/pending-hr');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ── TC-DIR-006 ──────────────────────────────────────────────────────────────
  test('TC-DIR-006: NEW_EMPLOYEE accessing /pending-hr → 403', async () => {
    User.findOne.mockResolvedValue({
      user_id: 9, email: 'emp@company.com', role: 'NEW_EMPLOYEE',
      first_name: 'Alice', last_name: 'Lee', is_active: true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 9, role: 'NEW_EMPLOYEE', email: 'emp@company.com',
        first_name: 'Alice', last_name: 'Lee',
      }),
    });

    const res = await request(app)
      .get('/api/director/pending-hr')
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(403);
  });

});

// =============================================================================
// STAGE 2 — HR Endorsement: POST /api/director/:recId/endorse
// PENDING_HR_REVIEW → PENDING_DIRECTOR
// =============================================================================

describe('POST /api/director/:recId/endorse — HR endorsement (FR-20 | NFR-02, NFR-03)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockHRUser);
    FinalRecommendation.findByPk.mockResolvedValue(makeMockRec());
  });

  // ── TC-DIR-007 ──────────────────────────────────────────────────────────────
  test('TC-DIR-007: valid endorse with notes → 200 PENDING_DIRECTOR', async () => {
    const res = await request(app)
      .post('/api/director/10/endorse')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ hr_endorsement_notes: 'Reviewed and endorsed — strong performance.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('PENDING_DIRECTOR');
  });

  // ── TC-DIR-008 ──────────────────────────────────────────────────────────────
  test('TC-DIR-008: endorse without notes is also valid (notes are optional) → 200', async () => {
    const res = await request(app)
      .post('/api/director/10/endorse')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ── TC-DIR-009 ──────────────────────────────────────────────────────────────
  test('TC-DIR-009: recommendation already PENDING_DIRECTOR → 409 conflict', async () => {
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'PENDING_DIRECTOR' })
    );

    const res = await request(app)
      .post('/api/director/10/endorse')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/PENDING_DIRECTOR|cannot endorse/i);
  });

  // ── TC-DIR-010 ──────────────────────────────────────────────────────────────
  test('TC-DIR-010: DIRECTOR attempting to endorse → 403', async () => {
    User.findOne.mockResolvedValue(mockDirectorUser);

    const res = await request(app)
      .post('/api/director/10/endorse')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  // ── TC-DIR-011 ──────────────────────────────────────────────────────────────
  test('TC-DIR-011: non-existent recommendation → 404', async () => {
    FinalRecommendation.findByPk.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/director/999/endorse')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

});

// =============================================================================
// STAGE 2 — HR Return: POST /api/director/:recId/return-to-manager
// PENDING_HR_REVIEW → RETURNED_TO_MANAGER
// =============================================================================

describe('POST /api/director/:recId/return-to-manager — HR return (FR-20 | NFR-02)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockHRUser);
    FinalRecommendation.findByPk.mockResolvedValue(makeMockRec());
  });

  // ── TC-DIR-012 ──────────────────────────────────────────────────────────────
  test('TC-DIR-012: valid return with feedback notes → 200 RETURNED_TO_MANAGER', async () => {
    const res = await request(app)
      .post('/api/director/10/return-to-manager')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ hr_endorsement_notes: 'Attendance score seems inconsistent — please review.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('RETURNED_TO_MANAGER');
  });

  // ── TC-DIR-013 ──────────────────────────────────────────────────────────────
  test('TC-DIR-013: return without feedback notes → 400 (notes are required)', async () => {
    const res = await request(app)
      .post('/api/director/10/return-to-manager')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/required/i);
  });

  // ── TC-DIR-014 ──────────────────────────────────────────────────────────────
  test('TC-DIR-014: return a rec that is already RETURNED_TO_MANAGER → 409', async () => {
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'RETURNED_TO_MANAGER' })
    );

    const res = await request(app)
      .post('/api/director/10/return-to-manager')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ hr_endorsement_notes: 'Second return attempt.' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

});

// =============================================================================
// STAGE 2b — Manager Resubmit: POST /api/director/:recId/resubmit
// RETURNED_TO_MANAGER → PENDING_HR_REVIEW
// =============================================================================

describe('POST /api/director/:recId/resubmit — manager resubmit (FR-20 | NFR-03)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockManagerUser);
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'RETURNED_TO_MANAGER', submitted_by: 5 })
    );
  });

  // ── TC-DIR-015 ──────────────────────────────────────────────────────────────
  test('TC-DIR-015: valid resubmit by originating manager → 200 PENDING_HR_REVIEW', async () => {
    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Updated the attendance records as requested. Scores are now accurate.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('PENDING_HR_REVIEW');
  });

  // ── TC-DIR-016 ──────────────────────────────────────────────────────────────
  test('TC-DIR-016: resubmit without justification → 400', async () => {
    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/justification.*required/i);
  });

  // ── TC-DIR-017 ──────────────────────────────────────────────────────────────
  test('TC-DIR-017: resubmit a rec that is still PENDING_HR_REVIEW → 409', async () => {
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'PENDING_HR_REVIEW', submitted_by: 5 })
    );

    const res = await request(app)
      .post('/api/director/10/resubmit')
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ justification: 'Ready to go.' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

});

// =============================================================================
// STAGE 3 — Director Approve: POST /api/director/:recId/approve
// PENDING_DIRECTOR → APPROVED
// =============================================================================

describe('POST /api/director/:recId/approve — Director final approval (FR-15, FR-20)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockDirectorUser);
    // Approve controller includes ProbationPeriod in its findByPk call
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'PENDING_DIRECTOR' })
    );
  });

  // ── TC-DIR-018 ──────────────────────────────────────────────────────────────
  test('TC-DIR-018: Director approves CONFIRM rec → 200 APPROVED; period CONFIRMED', async () => {
    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ director_reason: 'Excellent performance throughout probation.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('APPROVED');
    expect(res.body.data.period_status).toBe('CONFIRMED');
  });

  // ── TC-DIR-019 ──────────────────────────────────────────────────────────────
  test('TC-DIR-019: approve an EXTEND rec → period_status EXTENDED', async () => {
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'PENDING_DIRECTOR', recommendation_type: 'EXTEND' })
    );

    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.period_status).toBe('EXTENDED');
  });

  // ── TC-DIR-020 ──────────────────────────────────────────────────────────────
  test('TC-DIR-020: approve a DISMISS rec → period_status DISMISSED', async () => {
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'PENDING_DIRECTOR', recommendation_type: 'DISMISS' })
    );

    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.period_status).toBe('DISMISSED');
  });

  // ── TC-DIR-021 ──────────────────────────────────────────────────────────────
  test('TC-DIR-021: rec not in PENDING_DIRECTOR → 409 conflict', async () => {
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'APPROVED' })
    );

    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/APPROVED|cannot approve/i);
  });

  // ── TC-DIR-022 ──────────────────────────────────────────────────────────────
  test('TC-DIR-022: HR_ADMIN attempting to approve → 403', async () => {
    User.findOne.mockResolvedValue(mockHRUser);

    const res = await request(app)
      .post('/api/director/10/approve')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

});

// =============================================================================
// STAGE 3 — Director Return: POST /api/director/:recId/return
// PENDING_DIRECTOR → RETURNED_TO_MANAGER
// =============================================================================

describe('POST /api/director/:recId/return — Director return to manager (FR-20)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(mockDirectorUser);
    FinalRecommendation.findByPk.mockResolvedValue(
      makeMockRec({ approval_status: 'PENDING_DIRECTOR' })
    );
  });

  // ── TC-DIR-023 ──────────────────────────────────────────────────────────────
  test('TC-DIR-023: Director returns with reason → 200 RETURNED_TO_MANAGER', async () => {
    const res = await request(app)
      .post('/api/director/10/return')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({ director_reason: 'Please provide supporting attendance documentation.' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval_status).toBe('RETURNED_TO_MANAGER');
  });

  // ── TC-DIR-024 ──────────────────────────────────────────────────────────────
  test('TC-DIR-024: Director return without reason → 400', async () => {
    const res = await request(app)
      .post('/api/director/10/return')
      .set('Authorization', `Bearer ${dirToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/director_reason.*required|required/i);
  });

  // ── TC-DIR-025 ──────────────────────────────────────────────────────────────
  test('TC-DIR-025: HR_ADMIN attempting director return → 403', async () => {
    User.findOne.mockResolvedValue(mockHRUser);

    const res = await request(app)
      .post('/api/director/10/return')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ director_reason: 'HR should not be able to use this endpoint.' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

});
