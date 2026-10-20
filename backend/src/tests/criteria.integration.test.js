// =============================================================================
// src/tests/criteria.integration.test.js
// Supertest integration tests for the evaluation criteria API.
//
// Tests cover:
//   - GET  /api/criteria  (SYSTEM_ADMIN only — RBAC enforcement)
//   - POST /api/criteria  (weight validation — must not exceed 100%)
//
// EvaluationCriterion and User models are mocked so no DB is needed.
//
// Requirements: FR-10 | NFR-02, NFR-03 | Objective 2 (Probation Evaluation)
// =============================================================================

// ── Mock: express-rate-limit → passthrough ───────────────────────────────────
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

// ── Mock: bcrypt (native binary incompatible with Linux CI sandbox) ───────────
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash:    jest.fn().mockResolvedValue('$2b$12$hashedpassword'),
}));

// ── Mock: nodemailer ──────────────────────────────────────────────────────────
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  }),
}));

// ── Mock: Sequelize models ────────────────────────────────────────────────────
jest.mock('../models', () => {
  // Default mock criteria (total active weight = 60%)
  const activeCriteria = [
    { criterion_id: 1, name: 'Job Performance', weight_percent: '30.00', is_active: true },
    { criterion_id: 2, name: 'Attendance',      weight_percent: '20.00', is_active: true },
    { criterion_id: 3, name: 'Punctuality',     weight_percent: '10.00', is_active: true },
  ];

  const mockSysAdmin = {
    user_id: 99, email: 'admin@company.com', role: 'SYSTEM_ADMIN',
    first_name: 'Admin', last_name: 'User', is_active: true,
    toJSON: jest.fn().mockReturnValue({
      user_id: 99, email: 'admin@company.com', role: 'SYSTEM_ADMIN',
      first_name: 'Admin', last_name: 'User',
    }),
  };

  return {
    sequelize: {
      authenticate: jest.fn().mockResolvedValue(undefined),
    },
    User: {
      findOne:  jest.fn().mockResolvedValue(mockSysAdmin),
      findByPk: jest.fn().mockResolvedValue(mockSysAdmin),
    },
    EvaluationCriterion: {
      findAll:   jest.fn().mockResolvedValue(activeCriteria),
      findByPk:  jest.fn(),
      create:    jest.fn(),
      update:    jest.fn(),
      destroy:   jest.fn(),
    },
    AuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../app');
const { User, EvaluationCriterion } = require('../models');

// Helper: generate a signed JWT
const generateToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

// Token payloads
const sysAdminPayload = {
  user_id: 99, email: 'admin@company.com', role: 'SYSTEM_ADMIN',
  first_name: 'Admin', last_name: 'User',
};
const hrAdminPayload = {
  user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
  first_name: 'Jane', last_name: 'Doe',
};

// Active criteria fixture (total weight = 60%)
const activeCriteria = [
  { criterion_id: 1, name: 'Job Performance', weight_percent: '30.00', is_active: true },
  { criterion_id: 2, name: 'Attendance',      weight_percent: '20.00', is_active: true },
  { criterion_id: 3, name: 'Punctuality',     weight_percent: '10.00', is_active: true },
];

// =============================================================================
// GET /api/criteria
// SYSTEM_ADMIN only — returns list of evaluation criteria
// =============================================================================

describe('GET /api/criteria — access control (FR-10 | NFR-03)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // authenticate middleware returns SYSTEM_ADMIN by default
    User.findOne.mockResolvedValue({
      user_id: 99, email: 'admin@company.com', role: 'SYSTEM_ADMIN',
      first_name: 'Admin', last_name: 'User', is_active: true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 99, email: 'admin@company.com', role: 'SYSTEM_ADMIN',
        first_name: 'Admin', last_name: 'User',
      }),
    });
    EvaluationCriterion.findAll.mockResolvedValue(activeCriteria);
  });

  // --- TC-CRIT-001 -----------------------------------------------------------
  test('TC-CRIT-001: SYSTEM_ADMIN with valid token → 200 with criteria array', async () => {
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .get('/api/criteria')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // --- TC-CRIT-002 -----------------------------------------------------------
  test('TC-CRIT-002: HR_ADMIN token → 403 access denied', async () => {
    // Authenticate middleware returns HR_ADMIN user
    User.findOne.mockResolvedValue({
      user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
      first_name: 'Jane', last_name: 'Doe', is_active: true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
        first_name: 'Jane', last_name: 'Doe',
      }),
    });

    const token = generateToken(hrAdminPayload);

    const res = await request(app)
      .get('/api/criteria')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/access denied|permission/i);
  });

  // --- TC-CRIT-003 -----------------------------------------------------------
  test('TC-CRIT-003: no token → 401 authentication required', async () => {
    const res = await request(app).get('/api/criteria');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  // --- TC-CRIT-004 -----------------------------------------------------------
  test('TC-CRIT-004: LINE_MANAGER token → 403', async () => {
    User.findOne.mockResolvedValue({
      user_id: 5, email: 'mgr@company.com', role: 'LINE_MANAGER',
      first_name: 'Tom', last_name: 'Jones', is_active: true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 5, email: 'mgr@company.com', role: 'LINE_MANAGER',
        first_name: 'Tom', last_name: 'Jones',
      }),
    });

    const token = generateToken({
      user_id: 5, email: 'mgr@company.com', role: 'LINE_MANAGER',
      first_name: 'Tom', last_name: 'Jones',
    });

    const res = await request(app)
      .get('/api/criteria')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

});

// =============================================================================
// POST /api/criteria
// SYSTEM_ADMIN only — creates a new criterion with weight validation
// =============================================================================

describe('POST /api/criteria — weight validation (FR-10 | NFR-02, NFR-03)', () => {

  // Restore fresh SYSTEM_ADMIN context and the default active criteria before each test
  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue({
      user_id: 99, email: 'admin@company.com', role: 'SYSTEM_ADMIN',
      first_name: 'Admin', last_name: 'User', is_active: true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 99, email: 'admin@company.com', role: 'SYSTEM_ADMIN',
        first_name: 'Admin', last_name: 'User',
      }),
    });
    // Current active total = 60% (30 + 20 + 10)
    EvaluationCriterion.findAll.mockResolvedValue(activeCriteria);
    // Default successful creation
    EvaluationCriterion.create.mockResolvedValue({
      criterion_id:  4,
      name:          'Teamwork',
      weight_percent:'20.00',
      is_active:     true,
    });
  });

  // --- TC-CRIT-005 -----------------------------------------------------------
  test('TC-CRIT-005: valid criterion with weight that fits within 100% → 201', async () => {
    // Active total is 60%; adding 20% brings it to 80% — valid
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Teamwork', weight_percent: 20, display_order: 4 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  // --- TC-CRIT-006 -----------------------------------------------------------
  test('TC-CRIT-006: weight that would exceed 100% total → 400', async () => {
    // Active total is 60%; adding 50% would push to 110% — invalid
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attitude', weight_percent: 50, display_order: 4 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/exceed 100/i);
  });

  // --- TC-CRIT-007 -----------------------------------------------------------
  test('TC-CRIT-007: weight exactly fills remaining 40% → 201', async () => {
    // Active total 60% + new 40% = exactly 100% — valid
    EvaluationCriterion.create.mockResolvedValue({
      criterion_id: 4, name: 'Attitude', weight_percent: '40.00', is_active: true,
    });
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attitude', weight_percent: 40, display_order: 4 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  // --- TC-CRIT-008 -----------------------------------------------------------
  test('TC-CRIT-008: weight of 0 → 400 (weight must be > 0)', async () => {
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attitude', weight_percent: 0, display_order: 4 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/between 1 and 100/i);
  });

  // --- TC-CRIT-009 -----------------------------------------------------------
  test('TC-CRIT-009: negative weight → 400', async () => {
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attitude', weight_percent: -10, display_order: 4 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/between 1 and 100/i);
  });

  // --- TC-CRIT-010 -----------------------------------------------------------
  test('TC-CRIT-010: weight > 100 → 400 (single criterion cannot exceed 100%)', async () => {
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attitude', weight_percent: 150, display_order: 4 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/between 1 and 100/i);
  });

  // --- TC-CRIT-011 -----------------------------------------------------------
  test('TC-CRIT-011: non-numeric weight → 400', async () => {
    const token = generateToken(sysAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attitude', weight_percent: 'twenty', display_order: 4 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // --- TC-CRIT-012 -----------------------------------------------------------
  test('TC-CRIT-012: POST /api/criteria by HR_ADMIN → 403', async () => {
    User.findOne.mockResolvedValue({
      user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
      first_name: 'Jane', last_name: 'Doe', is_active: true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
        first_name: 'Jane', last_name: 'Doe',
      }),
    });

    const token = generateToken(hrAdminPayload);

    const res = await request(app)
      .post('/api/criteria')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Attitude', weight_percent: 20, display_order: 4 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

});
