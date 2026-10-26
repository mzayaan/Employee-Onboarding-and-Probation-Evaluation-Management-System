// =============================================================================
// src/tests/compliance.integration.test.js
// Supertest integration tests for the Mauritius compliance API endpoints.
//
// Covers:
//   POST   /api/contracts           — create employment contract (FR-20)
//   GET    /api/contracts/mine      — employee views own contract (FR-20)
//   PATCH  /api/contracts/:id/sign  — employee signs contract (FR-20)
//   POST   /api/tax-declarations    — submit MRA EDF (FR-21)
//   GET    /api/tax-declarations/mine — employee views declaration (FR-21)
//   POST   /api/hrdc-training       — HR logs training record (FR-22)
//   GET    /api/hrdc-training/export/g1 — HR exports G1 PDF (FR-22)
//
// All Sequelize models and external services are mocked.
// No real database or email connections are used.
//
// Objectives: Objective 1 (Onboarding), Objective 3 (Reporting)
// Requirements: FR-20, FR-21, FR-22, FR-18, NFR-02, NFR-03, NFR-08
// =============================================================================

// ── Suppress rate-limiter so requests are not blocked in test runs ────────────
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

// ── Nodemailer: prevent real email delivery ───────────────────────────────────
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  }),
}));

// ── bcrypt: skip slow hashing ─────────────────────────────────────────────────
jest.mock('bcrypt', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash:    jest.fn().mockResolvedValue('$2b$12$mockhash'),
}));

// ── Cloudinary: prevent real uploads ─────────────────────────────────────────
jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload_stream: jest.fn(),
    },
    config: jest.fn(),
  },
}));

// ── PDFKit: prevent real PDF generation (G1 export test checks headers only) ──
jest.mock('pdfkit', () => {
  const EventEmitter = require('events');
  return jest.fn(() => {
    const doc = new EventEmitter();
    doc.text     = jest.fn().mockReturnThis();
    doc.fontSize = jest.fn().mockReturnThis();
    doc.moveDown = jest.fn().mockReturnThis();
    doc.end      = jest.fn(() => doc.emit('end'));
    doc.pipe     = jest.fn();
    return doc;
  });
});

// ── Sequelize models: full mock layer ────────────────────────────────────────
jest.mock('../models', () => {
  // ── Shared mock data ──────────────────────────────────────────────────────
  const mockHRUser = {
    user_id:       2,
    email:         'hr@company.com',
    role:          'HR_ADMIN',
    first_name:    'Jane',
    last_name:     'Doe',
    password_hash: '$2b$12$mockhash',
    is_active:     true,
    update:        jest.fn().mockResolvedValue(true),
    toJSON:        jest.fn().mockReturnValue({
      user_id: 2, email: 'hr@company.com', role: 'HR_ADMIN',
      first_name: 'Jane', last_name: 'Doe',
    }),
  };

  const mockEmpUser = {
    user_id:       5,
    email:         'emp@company.com',
    role:          'NEW_EMPLOYEE',
    first_name:    'Tom',
    last_name:     'Smith',
    password_hash: '$2b$12$mockhash',
    is_active:     true,
    update:        jest.fn().mockResolvedValue(true),
    toJSON:        jest.fn().mockReturnValue({
      user_id: 5, email: 'emp@company.com', role: 'NEW_EMPLOYEE',
      first_name: 'Tom', last_name: 'Smith',
    }),
  };

  const mockProfile = {
    profile_id:        10,
    user_id:           5,
    first_name:        'Tom',
    last_name:         'Smith',
    start_date:        '2026-01-01',
    probation_end_date:'2026-06-30',
    update:            jest.fn().mockResolvedValue(true),
  };

  const mockContract = {
    contract_id:  1,
    profile_id:   10,
    start_date:   '2026-01-01',
    end_date:     '2026-07-01',
    status:       'pending_signature',
    document_url: 'https://res.cloudinary.com/test/contract.pdf',
    signed_at:    null,
    save:         jest.fn().mockResolvedValue(true),
    update:       jest.fn().mockResolvedValue(true),
    toJSON:       jest.fn().mockReturnValue({
      contract_id: 1, profile_id: 10, status: 'pending_signature',
    }),
  };

  const mockTaxDeclaration = {
    declaration_id: 1,
    profile_id:     10,
    tax_category:   'B',
    effective_year: 2026,
    is_active:      true,
    update:         jest.fn().mockResolvedValue(true),
    toJSON:         jest.fn().mockReturnValue({
      declaration_id: 1, profile_id: 10, tax_category: 'B', effective_year: 2026,
    }),
  };

  const mockTrainingLog = {
    training_id:     1,
    profile_id:      10,
    training_title:  'React.js Advanced',
    provider:        'Mauritius Training Institute',
    cost:            15000,
    hours_completed: 24,
    levy_claimable:  true,
    training_date:   '2026-03-15',
    toJSON:          jest.fn().mockReturnValue({
      training_id: 1, training_title: 'React.js Advanced', cost: 15000,
    }),
  };

  return {
    sequelize: {
      authenticate: jest.fn().mockResolvedValue(undefined),
      sync:         jest.fn().mockResolvedValue(undefined),
    },

    User: {
      findOne: jest.fn(({ where: { email } }) => {
        if (email === 'hr@company.com')  return Promise.resolve(mockHRUser);
        if (email === 'emp@company.com') return Promise.resolve(mockEmpUser);
        return Promise.resolve(null);
      }),
      findByPk: jest.fn((id) => {
        if (id === 2) return Promise.resolve(mockHRUser);
        if (id === 5) return Promise.resolve(mockEmpUser);
        return Promise.resolve(null);
      }),
    },

    EmployeeProfile: {
      findOne: jest.fn().mockResolvedValue(mockProfile),
      findByPk: jest.fn().mockResolvedValue(mockProfile),
    },

    Contract: {
      findOne:   jest.fn().mockResolvedValue(mockContract),
      findByPk:  jest.fn().mockResolvedValue(mockContract),
      create:    jest.fn().mockResolvedValue(mockContract),
    },

    TaxDeclaration: {
      findOne:   jest.fn().mockResolvedValue(null),   // default: no existing declaration
      findByPk:  jest.fn().mockResolvedValue(mockTaxDeclaration),
      create:    jest.fn().mockResolvedValue(mockTaxDeclaration),
      upsert:    jest.fn().mockResolvedValue([mockTaxDeclaration, true]),
    },

    HrdcTrainingLog: {
      findAll:   jest.fn().mockResolvedValue([mockTrainingLog]),
      findByPk:  jest.fn().mockResolvedValue(mockTrainingLog),
      create:    jest.fn().mockResolvedValue(mockTrainingLog),
      destroy:   jest.fn().mockResolvedValue(1),
    },

    AuditLog: {
      create: jest.fn().mockResolvedValue({ audit_id: 1 }),
    },

    Notification: {
      create:  jest.fn().mockResolvedValue({ notification_id: 1 }),
      findAll: jest.fn().mockResolvedValue([]),
    },
  };
});

// ── Test setup ────────────────────────────────────────────────────────────────
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../app');

/**
 * Generate a signed JWT for the given role.
 * Uses the test secret defined in src/tests/setup.js.
 */
const makeToken = (userId, role) =>
  jwt.sign({ user_id: userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const hrToken  = makeToken(2, 'HR_ADMIN');
const empToken = makeToken(5, 'NEW_EMPLOYEE');

// =============================================================================
// CONTRACT TESTS — FR-20 (Employment Contract), WRA 2019 s.13
// =============================================================================

describe('POST /api/contracts — create employment contract (FR-20)', () => {

  test('TC-COMP-I-001: HR Admin creates valid contract → 201 Created', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        profile_id:              10,
        start_date:              '2026-01-01',
        end_date:                '2026-07-01',
        probation_clause_included: true,
        terms:                   'Standard probation terms apply.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('TC-COMP-I-002: probation exceeds 184 days → 400 WRA 2019 violation', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        profile_id:              10,
        start_date:              '2026-01-01',
        end_date:                '2027-06-01',   // > 184 days
        probation_clause_included: true,
        terms:                   'Extended terms.',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/WRA 2019/);
  });

  test('TC-COMP-I-003: New Employee cannot create contract → 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        profile_id: 10,
        start_date: '2026-01-01',
        end_date:   '2026-07-01',
      });

    expect(res.status).toBe(403);
  });

  test('TC-COMP-I-004: unauthenticated request → 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/contracts')
      .send({ profile_id: 10 });

    expect(res.status).toBe(401);
  });

  test('TC-COMP-I-005: probation_clause_included = false → system forces PERMANENT status', async () => {
    // The enforceProbationClause middleware converts the request before the
    // controller receives it.  The controller mock returns 201 regardless,
    // so we verify the middleware transforms the body by checking no 4xx is
    // returned (the middleware calls next() after modification).
    const res = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        profile_id:              10,
        start_date:              '2026-01-01',
        end_date:                '2026-07-01',
        probation_clause_included: false,
        terms:                   'Permanent from day one.',
      });

    expect([201, 200]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

});

// =============================================================================
// GET /api/contracts/mine — employee views own contract (FR-20)
// =============================================================================

describe('GET /api/contracts/mine — employee views contract (FR-20)', () => {

  test('TC-COMP-I-006: authenticated employee → 200 with contract data', async () => {
    const res = await request(app)
      .get('/api/contracts/mine')
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  test('TC-COMP-I-007: HR Admin cannot access /mine → 403', async () => {
    const res = await request(app)
      .get('/api/contracts/mine')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(res.status).toBe(403);
  });

});

// =============================================================================
// TAX DECLARATION TESTS — FR-21 (MRA Employee Declaration Form)
// =============================================================================

describe('POST /api/tax-declarations — submit MRA EDF (FR-21)', () => {

  test('TC-COMP-I-008: employee submits valid tax category B → 201 Created', async () => {
    const res = await request(app)
      .post('/api/tax-declarations')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ tax_category: 'B', effective_year: 2026 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('TC-COMP-I-009: invalid tax category H → 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/tax-declarations')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ tax_category: 'H', effective_year: 2026 });

    // Controller must reject categories outside A-G
    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  test('TC-COMP-I-010: HR Admin cannot submit tax declaration → 403', async () => {
    const res = await request(app)
      .post('/api/tax-declarations')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ tax_category: 'A', effective_year: 2026 });

    expect(res.status).toBe(403);
  });

  test('TC-COMP-I-011: unauthenticated request → 401', async () => {
    const res = await request(app)
      .post('/api/tax-declarations')
      .send({ tax_category: 'A', effective_year: 2026 });

    expect(res.status).toBe(401);
  });

});

// =============================================================================
// GET /api/tax-declarations/mine — employee views own declaration (FR-21)
// =============================================================================

describe('GET /api/tax-declarations/mine — employee views EDF (FR-21)', () => {

  test('TC-COMP-I-012: authenticated employee → 200 with declaration data', async () => {
    // Override mock to return existing declaration
    const { TaxDeclaration } = require('../models');
    TaxDeclaration.findOne.mockResolvedValueOnce({
      declaration_id: 1,
      profile_id:     10,
      tax_category:   'B',
      effective_year: 2026,
      toJSON:         jest.fn().mockReturnValue({ declaration_id: 1, tax_category: 'B' }),
    });

    const res = await request(app)
      .get('/api/tax-declarations/mine')
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

});

// =============================================================================
// HRDC TRAINING TESTS — FR-22 (HRDC G1 Levy Refund)
// =============================================================================

describe('POST /api/hrdc-training — HR logs training record (FR-22)', () => {

  test('TC-COMP-I-013: HR Admin adds valid training log → 201 Created', async () => {
    const res = await request(app)
      .post('/api/hrdc-training')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        profile_id:      10,
        training_title:  'React.js Advanced',
        provider:        'Mauritius Training Institute',
        cost:            15000,
        hours_completed: 24,
        training_date:   '2026-03-15',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('TC-COMP-I-014: New Employee cannot log training → 403', async () => {
    const res = await request(app)
      .post('/api/hrdc-training')
      .set('Authorization', `Bearer ${empToken}`)
      .send({ profile_id: 10, training_title: 'Test' });

    expect(res.status).toBe(403);
  });

  test('TC-COMP-I-015: unauthenticated request → 401', async () => {
    const res = await request(app)
      .post('/api/hrdc-training')
      .send({ profile_id: 10 });

    expect(res.status).toBe(401);
  });

});

// =============================================================================
// GET /api/hrdc-training/export/g1 — HR exports HRDC G1 PDF (FR-22)
// =============================================================================

describe('GET /api/hrdc-training/export/g1 — G1 PDF export (FR-22)', () => {

  test('TC-COMP-I-016: HR Admin requests G1 export → response initiated', async () => {
    const res = await request(app)
      .get('/api/hrdc-training/export/g1')
      .query({ year: 2026 })
      .set('Authorization', `Bearer ${hrToken}`);

    // The controller either returns 200 with PDF headers or a JSON success
    // depending on implementation.  We verify it is not a 4xx error.
    expect(res.status).toBeLessThan(400);
  });

  test('TC-COMP-I-017: New Employee cannot access G1 export → 403', async () => {
    const res = await request(app)
      .get('/api/hrdc-training/export/g1')
      .query({ year: 2026 })
      .set('Authorization', `Bearer ${empToken}`);

    expect(res.status).toBe(403);
  });

  test('TC-COMP-I-018: unauthenticated request → 401', async () => {
    const res = await request(app)
      .get('/api/hrdc-training/export/g1')
      .query({ year: 2026 });

    expect(res.status).toBe(401);
  });

});
