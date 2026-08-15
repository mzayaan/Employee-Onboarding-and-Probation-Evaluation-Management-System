// =============================================================================
// src/tests/auth.integration.test.js
// Supertest integration tests for authentication endpoints.
//
// Covers POST /api/auth/login and GET /api/auth/me.
// The Sequelize User model and bcrypt are mocked so no database connection
// is required.  JWT signing and verification use the test JWT_SECRET defined
// in src/tests/setup.js.
//
// Requirements: FR-01, FR-02, FR-03 | NFR-02, NFR-03
// =============================================================================

// ── Mock: express-rate-limit → passthrough (prevents hitting the 10-req limit) ─
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

// ── Mock: bcrypt (avoids slow hashing in tests) ──────────────────────────────
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash:    jest.fn().mockResolvedValue('$2b$12$mockhash'),
}));

// ── Mock: nodemailer (prevents real email in forgot-password tests) ──────────
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  }),
}));

// ── Mock: Sequelize models ────────────────────────────────────────────────────
// Mocked at the module level so every require('../models') in the codebase
// (authController, authenticate middleware, auditLogger) receives these fakes.
jest.mock('../models', () => {
  const mockHRUser = {
    user_id:       1,
    email:         'hr@company.com',
    role:          'HR_ADMIN',
    first_name:    'Jane',
    last_name:     'Doe',
    password_hash: '$2b$12$mockhash',
    is_active:     true,
    last_login_at: null,
    created_at:    new Date('2026-01-01'),
    update:        jest.fn().mockResolvedValue(true),
    toJSON:        jest.fn().mockReturnValue({
      user_id:       1,
      email:         'hr@company.com',
      role:          'HR_ADMIN',
      first_name:    'Jane',
      last_name:     'Doe',
      last_login_at: null,
      created_at:    new Date('2026-01-01'),
    }),
  };

  return {
    sequelize: {
      authenticate: jest.fn().mockResolvedValue(undefined),
      sync:         jest.fn().mockResolvedValue(undefined),
    },
    User: {
      findOne:  jest.fn().mockResolvedValue(mockHRUser),
      findByPk: jest.fn().mockResolvedValue(mockHRUser),
      create:   jest.fn(),
      update:   jest.fn(),
    },
    EmployeeProfile: {
      findOne: jest.fn().mockResolvedValue(null),
    },
    Department: {
      findAll: jest.fn().mockResolvedValue([]),
    },
    AuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
});

// ── Imports (after mocks are declared) ────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcrypt');
const app     = require('../app');
const { User } = require('../models');

// Helper: generate a signed JWT for a given user payload
const generateToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

// Shared test user payload
const hrUserPayload = {
  user_id:    1,
  email:      'hr@company.com',
  role:       'HR_ADMIN',
  first_name: 'Jane',
  last_name:  'Doe',
};

// =============================================================================
// POST /api/auth/login
// =============================================================================

describe('POST /api/auth/login (FR-01, FR-02 | NFR-02)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset User.findOne to return the mock HR user by default
    User.findOne.mockResolvedValue({
      user_id:       1,
      email:         'hr@company.com',
      role:          'HR_ADMIN',
      first_name:    'Jane',
      last_name:     'Doe',
      password_hash: '$2b$12$mockhash',
      is_active:     true,
      update:        jest.fn().mockResolvedValue(true),
    });
    // bcrypt.compare returns true (correct password) by default
    bcrypt.compare.mockResolvedValue(true);
  });

  // --- TC-AUTH-001 -----------------------------------------------------------
  test('TC-AUTH-001: valid credentials → 200 with JWT token and user object', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@company.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toMatchObject({
      email: 'hr@company.com',
      role:  'HR_ADMIN',
    });
  });

  // --- TC-AUTH-002 -----------------------------------------------------------
  test('TC-AUTH-002: missing email → 400 validation error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password1!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/email and password are required/i);
  });

  // --- TC-AUTH-003 -----------------------------------------------------------
  test('TC-AUTH-003: missing password → 400 validation error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@company.com' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/email and password are required/i);
  });

  // --- TC-AUTH-004 -----------------------------------------------------------
  test('TC-AUTH-004: non-existent user → 401 (prevents user enumeration)', async () => {
    User.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // The same generic message is returned whether user is not found or password is wrong
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  // --- TC-AUTH-005 -----------------------------------------------------------
  test('TC-AUTH-005: correct email but wrong password → 401', async () => {
    bcrypt.compare.mockResolvedValueOnce(false); // password mismatch

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@company.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  // --- TC-AUTH-006 -----------------------------------------------------------
  test('TC-AUTH-006: deactivated account → 403', async () => {
    User.findOne.mockResolvedValueOnce({
      user_id:       2,
      email:         'inactive@company.com',
      password_hash: '$2b$12$mockhash',
      is_active:     false,
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inactive@company.com', password: 'Password1!' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  // --- TC-AUTH-007 -----------------------------------------------------------
  test('TC-AUTH-007: empty body → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

});

// =============================================================================
// GET /api/auth/me
// Protected route — requires a valid Bearer token
// =============================================================================

describe('GET /api/auth/me (FR-02 | NFR-02, NFR-03)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // authenticate middleware: User.findOne by user_id
    // getMe controller: User.findOne by user_id (second call)
    User.findOne.mockResolvedValue({
      user_id:       1,
      email:         'hr@company.com',
      role:          'HR_ADMIN',
      first_name:    'Jane',
      last_name:     'Doe',
      last_login_at: null,
      created_at:    new Date('2026-01-01'),
      toJSON: jest.fn().mockReturnValue({
        user_id:       1,
        email:         'hr@company.com',
        role:          'HR_ADMIN',
        first_name:    'Jane',
        last_name:     'Doe',
        last_login_at: null,
        created_at:    new Date('2026-01-01'),
      }),
    });
  });

  // --- TC-AUTH-008 -----------------------------------------------------------
  test('TC-AUTH-008: valid Bearer token → 200 with user data', async () => {
    const token = generateToken(hrUserPayload);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({
      email: 'hr@company.com',
      role:  'HR_ADMIN',
    });
  });

  // --- TC-AUTH-009 -----------------------------------------------------------
  test('TC-AUTH-009: no Authorization header → 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/authentication required/i);
  });

  // --- TC-AUTH-010 -----------------------------------------------------------
  test('TC-AUTH-010: malformed token → 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // --- TC-AUTH-011 -----------------------------------------------------------
  test('TC-AUTH-011: expired token → 401 with session-expired message', async () => {
    // Sign a token that expired 1 second ago
    const expiredToken = jwt.sign(hrUserPayload, process.env.JWT_SECRET, { expiresIn: -1 });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/expired|session/i);
  });

  // --- TC-AUTH-012 -----------------------------------------------------------
  test('TC-AUTH-012: token signed with wrong secret → 401', async () => {
    const badToken = jwt.sign(hrUserPayload, 'wrong-secret');

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // --- TC-AUTH-013 -----------------------------------------------------------
  test('TC-AUTH-013: valid token but user no longer exists in DB → 401', async () => {
    // Both authenticate and getMe call User.findOne — both should return null
    User.findOne.mockResolvedValue(null);
    const token = generateToken(hrUserPayload);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not found|deactivated/i);
  });

});

// =============================================================================
// ROLE-BASED ACCESS CONTROL — verify 403 for wrong role
// Uses the GET /api/criteria endpoint (SYSTEM_ADMIN only) to confirm that
// a user with a different role receives 403, not 200 or 401.
// =============================================================================

describe('RBAC — unauthorised role returns 403 (FR-02 | NFR-03)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // authenticate middleware passes for any active user
    User.findOne.mockResolvedValue({
      user_id:    1,
      email:      'hr@company.com',
      role:       'HR_ADMIN',
      first_name: 'Jane',
      last_name:  'Doe',
      is_active:  true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 1, email: 'hr@company.com',
        role: 'HR_ADMIN', first_name: 'Jane', last_name: 'Doe',
      }),
    });
  });

  // --- TC-AUTH-014 -----------------------------------------------------------
  test('TC-AUTH-014: HR_ADMIN accessing SYSTEM_ADMIN-only route → 403', async () => {
    // HR_ADMIN token presented to /api/criteria which requires SYSTEM_ADMIN
    const hrToken = generateToken({
      user_id: 1, email: 'hr@company.com', role: 'HR_ADMIN',
      first_name: 'Jane', last_name: 'Doe',
    });

    const res = await request(app)
      .get('/api/criteria')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/access denied|permission/i);
  });

  // --- TC-AUTH-015 -----------------------------------------------------------
  test('TC-AUTH-015: NEW_EMPLOYEE accessing HR route → 403', async () => {
    // NEW_EMPLOYEE token presented to /api/criteria (SYSTEM_ADMIN only)
    User.findOne.mockResolvedValue({
      user_id: 3, email: 'emp@company.com', role: 'NEW_EMPLOYEE',
      first_name: 'Bob', last_name: 'Smith', is_active: true,
      toJSON: jest.fn().mockReturnValue({
        user_id: 3, email: 'emp@company.com', role: 'NEW_EMPLOYEE',
        first_name: 'Bob', last_name: 'Smith',
      }),
    });

    const empToken = generateToken({
      user_id: 3, email: 'emp@company.com', role: 'NEW_EMPLOYEE',
      first_name: 'Bob', last_name: 'Smith',
    });

    const res = await request(app)
      .get('/api/criteria')
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // --- TC-AUTH-016 -----------------------------------------------------------
  test('TC-AUTH-016: unauthenticated request to protected route → 401', async () => {
    const res = await request(app).get('/api/criteria');
    expect(res.status).toBe(401);
  });

});
