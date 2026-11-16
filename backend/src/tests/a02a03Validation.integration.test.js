// =============================================================================
// src/tests/a02a03Validation.integration.test.js
//
// Route-level integration tests for A02 (Multer middleware order) and
// A03 (salary validation).  Uses supertest against a real Express app
// mounted with the actual employee and contract route modules so that
// multipart/form-data bodies and JSON bodies go through the genuine
// middleware stack.
//
// A02 — Multer must run before validateNIC and validateProbationDuration
// -----------------------------------------------------------------------
//   TC-A02-001  multipart POST with invalid NIC → 400 (proves validators
//               run after Multer so req.body is populated)
//   TC-A02-002  multipart POST with probation end date before start date
//               → 400 (validateProbationDuration fires on parsed body)
//   TC-A02-003  JSON POST with invalid NIC → 400 (baseline — JSON path)
//   TC-A02-004  multipart POST with valid fields: validators pass,
//               response is not a 400 from NIC/probation validators
//   TC-A02-005  multipart POST with image attachment, invalid NIC → 400
//               before controller runs (persistence never attempted)
//
// A03 — validateSalary rejects malformed and out-of-range values
// ---------------------------------------------------------------
//   TC-A03-001  POST /api/employees JSON, salary_monthly = 0 (below min)
//               → 400 "below the configured minimum"
//   TC-A03-002  POST /api/employees JSON, salary_monthly = -500 → 400 negative
//   TC-A03-003  POST /api/employees JSON, salary_monthly = "abc" → 400 finite
//   TC-A03-004  POST /api/employees JSON, salary_monthly = "Infinity" → 400 finite
//   TC-A03-005  POST /api/employees JSON, salary_monthly = 20000 (above min)
//               → validateSalary passes; SystemConfig.findOne and User.findOne called
//   TC-A03-006  POST /api/contracts JSON, basic_salary_mur = -100 → 400 negative
//   TC-A03-007  POST /api/contracts JSON, basic_salary_mur = 100 (below min)
//               → 400 "below the configured minimum"
//   TC-A03-008  POST /api/contracts JSON, basic_salary_mur = 20000 (above min)
//               → validateSalary passes; SystemConfig.findOne and Contract.findOne called
//   TC-A03-009  PUT  /api/employees/:id/profile JSON, salary_monthly = -1
//               → 400 negative (PUT route is also guarded)
//   TC-A03-010  POST /api/employees JSON, salary_monthly absent (no field)
//               → NOT rejected by validateSalary (optional field)
//   TC-A03-011  SystemConfig.findOne throws → 500; User.create not called
//   TC-A03-012  SystemConfig.findOne returns null (no config row) → minimum
//               check skipped, request proceeds; User.findOne called
//   TC-A03-013  contract POST: invalid basic_salary_mur cannot be bypassed
//               via salary_monthly field
//
// FR-04 | NFR-02 | A02 | A03
// =============================================================================

// ─── bcrypt mock (PE32+ Windows binary cannot run in Linux sandbox) ──────────
jest.mock('bcrypt', () => ({
  hash:    jest.fn().mockResolvedValue('$2b$12$mockhash'),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('salt'),
}));

// ─── Cloudinary mock (avoid real uploads) ────────────────────────────────────
jest.mock('cloudinary', () => ({
  v2: {
    uploader: {
      upload_stream: jest.fn((_opts, cb) => {
        const { Writable } = require('stream');
        const ws = new Writable({ write(_c, _e, done) { done(); } });
        ws.on('finish', () => cb(null, { secure_url: 'https://res.cloudinary.com/test/image.jpg' }));
        return ws;
      }),
    },
    config: jest.fn(),
  },
}));

// ─── Utilities that touch external services ──────────────────────────────────
jest.mock('../utils/auditLogger', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/mailer', () => ({
  sendWelcomeEmail:           jest.fn().mockResolvedValue(undefined),
  sendManagerAssignmentEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../utils/generatePassword', () => ({
  generateSecurePassword: jest.fn().mockReturnValue('AutoPass123!'),
}));
jest.mock('../utils/passwordValidator', () => ({
  validatePasswordStrength: jest.fn().mockReturnValue({ valid: true }),
}));
jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

// ─── Auth middleware mocks ────────────────────────────────────────────────────
jest.mock('../middleware/authenticate', () => (req, _res, next) => {
  req.user = { user_id: 1, role: 'HR_ADMIN', email: 'hr@test.com' };
  next();
});
jest.mock('../middleware/authorize', () =>
  (..._roles) => (_req, _res, next) => next()
);

// ─── Models mock ─────────────────────────────────────────────────────────────
// SystemConfig.findOne returns a minimum of 17 745 MUR by default.
// Individual tests can override via mockResolvedValueOnce / mockRejectedValueOnce.
const MOCK_MIN_SALARY = 17745;

jest.mock('../models', () => {
  const mockTx = {
    commit:   jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };
  return {
    sequelize: {
      // Handle both invocation styles:
      //   manual:   const t = await sequelize.transaction(); ... t.commit();
      //   callback: await sequelize.transaction(async (t) => { ... });
      transaction: jest.fn().mockImplementation(async (optionsOrCallback) => {
        if (typeof optionsOrCallback === 'function') {
          return optionsOrCallback(mockTx);
        }
        return mockTx;
      }),
    },
    User: {
      count:   jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      create:  jest.fn().mockResolvedValue({
        user_id: 42, email: 'new@test.com', role: 'NEW_EMPLOYEE',
        first_name: 'Test', last_name: 'User', is_active: true,
      }),
    },
    EmployeeProfile: {
      create:      jest.fn().mockResolvedValue({ profile_id: 1, user_id: 42 }),
      findByPk:    jest.fn().mockResolvedValue({
        profile_id: 1, job_title: 'Dev',
        update: jest.fn().mockResolvedValue(undefined),
      }),
      findOne: jest.fn().mockResolvedValue(null),
      update:  jest.fn().mockResolvedValue([1]),
    },
    ProbationPeriod: {
      create:  jest.fn().mockResolvedValue({ period_id: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
    },
    EvaluationCheckpoint: {
      bulkCreate: jest.fn().mockResolvedValue([]),
    },
    LeaveBalance: {
      create:       jest.fn().mockResolvedValue({}),
      findOne:      jest.fn().mockResolvedValue(null),
      findOrCreate: jest.fn().mockResolvedValue([{}, true]),
    },
    DocumentType:       { findAll: jest.fn().mockResolvedValue([]) },
    OnboardingDocument: { count:   jest.fn().mockResolvedValue(0)  },
    TaskAssignment:     { count:   jest.fn().mockResolvedValue(0)  },
    Contract: {
      findOne: jest.fn().mockResolvedValue(null),
      create:  jest.fn().mockResolvedValue({ contract_id: 1 }),
    },
    SystemConfig: {
      findOne: jest.fn().mockResolvedValue({
        min_salary_mur: String(MOCK_MIN_SALARY),
        effective_date: '2026-01-01',
      }),
    },
  };
});

// ─── App setup ───────────────────────────────────────────────────────────────
const express        = require('express');
const supertest      = require('supertest');
const FormData       = require('form-data');
const employeeRouter = require('../routes/employeeRoutes');
const contractRouter = require('../routes/contractRoutes');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/employees', employeeRouter);
app.use('/api/contracts', contractRouter);

const request = supertest(app);

// ─── Stable reference to mocked models ───────────────────────────────────────
// After jest.mock('../models', factory), require('../models') returns the same
// mock object.  Holding a module-level reference lets all tests configure and
// assert against mock functions without re-requiring each time.
const mockedModels = require('../models');

// ─── Minimal valid employee body (JSON) ──────────────────────────────────────
const validEmployeeBase = () => ({
  email:                     'newstaff@company.com',
  password:                  'SecurePass1!',
  role:                      'NEW_EMPLOYEE',
  first_name:                'Alice',
  last_name:                 'Smith',
  job_title:                 'Software Engineer',
  start_date:                '2027-06-01',
  probation_duration_months: 3,
  gender:                    'Female',
});

// ─── Top-level beforeEach ─────────────────────────────────────────────────────
// Clear call counts, then explicitly re-establish SystemConfig.findOne.
// The re-establishment guards against jest.config.js having resetMocks: true
// (which wipes implementations as well as call counts) and removes the need
// for per-describe setup blocks.
beforeEach(() => {
  jest.clearAllMocks();
  mockedModels.SystemConfig.findOne.mockResolvedValue({
    min_salary_mur: String(MOCK_MIN_SALARY),
    effective_date: '2026-01-01',
  });
});

// =============================================================================
// A02 — Multer must run before NIC and probation validators
// =============================================================================

describe('A02 — Multer must run before NIC and probation validators', () => {

  it('TC-A02-001: multipart POST with invalid NIC → 400 NIC error (body parsed by Multer)', async () => {
    const form = new FormData();
    Object.entries(validEmployeeBase()).forEach(([k, v]) => form.append(k, String(v)));
    form.append('nic_number', 'INVALID');   // bad format

    const res = await request
      .post('/api/employees')
      .set(form.getHeaders())
      .send(form.getBuffer());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/NIC/i);
  });

  it('TC-A02-002: multipart POST with probation end date before start date → 400 probation error', async () => {
    const form = new FormData();
    const fields = { ...validEmployeeBase() };
    delete fields.probation_duration_months;
    fields.probation_end_date = '2027-05-01';   // before start_date 2027-06-01
    Object.entries(fields).forEach(([k, v]) => form.append(k, String(v)));

    const res = await request
      .post('/api/employees')
      .set(form.getHeaders())
      .send(form.getBuffer());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/probation|end date/i);
  });

  it('TC-A02-003: JSON POST with invalid NIC → 400 (baseline — JSON path always worked)', async () => {
    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), nic_number: 'BADFMT' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/NIC/i);
  });

  it('TC-A02-004: multipart POST with valid body — not rejected by NIC or probation validators', async () => {
    const form = new FormData();
    Object.entries({ ...validEmployeeBase(), nic_number: 'A1234567890123' }).forEach(
      ([k, v]) => form.append(k, String(v))
    );

    const res = await request
      .post('/api/employees')
      .set(form.getHeaders())
      .send(form.getBuffer());

    expect(res.status).not.toBe(400);
    if (res.status === 400) {
      expect(res.body.message).not.toMatch(/NIC/i);
      expect(res.body.message).not.toMatch(/probation|end date/i);
    }
  });

  it('TC-A02-005: multipart POST with image attachment, invalid NIC → 400 before controller runs', async () => {
    const form = new FormData();
    Object.entries(validEmployeeBase()).forEach(([k, v]) => form.append(k, String(v)));
    form.append('nic_number', 'INVALID');
    // Minimal JPEG magic bytes so Multer accepts it as an image upload
    form.append('profile_image', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), {
      filename:    'photo.jpg',
      contentType: 'image/jpeg',
    });

    const res = await request
      .post('/api/employees')
      .set(form.getHeaders())
      .send(form.getBuffer());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/NIC/i);
    // Controller was never entered — persistence must not have been attempted
    expect(mockedModels.User.count).not.toHaveBeenCalled();
    expect(mockedModels.User.create).not.toHaveBeenCalled();
  });
});

// =============================================================================
// A03 — Salary validation on employee and contract routes
// =============================================================================

describe('A03 — validateSalary: employee route (salary_monthly)', () => {

  it('TC-A03-001: salary_monthly = 0 (below configured minimum 17745) → 400 minimum error', async () => {
    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), salary_monthly: 0 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/below the configured minimum/i);
  });

  it('TC-A03-002: salary_monthly = -500 → 400 negative error', async () => {
    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), salary_monthly: -500 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/must not be negative/i);
  });

  it('TC-A03-003: salary_monthly = "abc" (non-numeric string) → 400 finite error', async () => {
    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), salary_monthly: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/finite/i);
  });

  it('TC-A03-004: salary_monthly = "Infinity" → 400 finite error', async () => {
    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), salary_monthly: 'Infinity' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/finite/i);
  });

  it('TC-A03-005: salary_monthly = 20000 (above configured minimum) → validateSalary passes; User.findOne reached', async () => {
    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), salary_monthly: 20000 });

    // validateSalary must have read SystemConfig
    expect(mockedModels.SystemConfig.findOne).toHaveBeenCalled();
    // Controller must have been entered — User.findOne (email uniqueness check) is
    // the first DB call in createEmployee for a NEW_EMPLOYEE (User.count is only
    // called for HR_ADMIN role creation).
    expect(mockedModels.User.findOne).toHaveBeenCalled();
    // No salary-validation error returned
    if (res.status === 400) {
      expect(res.body.message).not.toMatch(/salary|finite|negative|minimum/i);
    }
  });

  it('TC-A03-009: PUT /api/employees/:id/profile, salary_monthly = -1 → 400 negative', async () => {
    const res = await request
      .put('/api/employees/1/profile')
      .send({ salary_monthly: -1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/must not be negative/i);
  });

  it('TC-A03-010: salary_monthly absent → NOT rejected by validateSalary (optional field)', async () => {
    const body = validEmployeeBase();
    // salary_monthly is not in validEmployeeBase — confirm it is absent
    expect(body.salary_monthly).toBeUndefined();

    const res = await request.post('/api/employees').send(body);

    if (res.status === 400) {
      expect(res.body.message).not.toMatch(/salary|finite|negative|minimum/i);
    }
  });

  it('TC-A03-011: SystemConfig.findOne throws → 500; downstream persistence not attempted', async () => {
    mockedModels.SystemConfig.findOne.mockRejectedValueOnce(new Error('DB timeout'));

    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), salary_monthly: 20000 });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    // Persistence must NOT have been attempted when validation cannot complete
    expect(mockedModels.User.create).not.toHaveBeenCalled();
  });

  it('TC-A03-012: SystemConfig.findOne returns null (no config row) → minimum check skipped; request proceeds to controller', async () => {
    mockedModels.SystemConfig.findOne.mockResolvedValueOnce(null);

    // A very low salary — would fail if the minimum were enforced
    const res = await request
      .post('/api/employees')
      .send({ ...validEmployeeBase(), salary_monthly: 100 });

    // Must not return a 500 or a minimum-salary 400
    expect(res.status).not.toBe(500);
    if (res.status === 400) {
      expect(res.body.message).not.toMatch(/minimum/i);
    }
    // Controller was reached because validator called next() — User.findOne
    // (email uniqueness check) is the first DB call in createEmployee for a NEW_EMPLOYEE.
    expect(mockedModels.User.findOne).toHaveBeenCalled();
  });
});

describe('A03 — validateSalary: contract route (basic_salary_mur)', () => {

  const validContractBase = () => ({
    profile_id:       1,
    contract_type:    'FULL_TIME',
    basic_salary_mur: 20000,
  });

  it('TC-A03-006: basic_salary_mur = -100 → 400 negative error', async () => {
    const res = await request
      .post('/api/contracts')
      .send({ ...validContractBase(), basic_salary_mur: -100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/must not be negative/i);
  });

  it('TC-A03-007: basic_salary_mur = 100 (below minimum 17745) → 400 minimum error', async () => {
    const res = await request
      .post('/api/contracts')
      .send({ ...validContractBase(), basic_salary_mur: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/below the configured minimum/i);
  });

  it('TC-A03-008: basic_salary_mur = 20000 (above minimum) → validateSalary passes; controller is reached', async () => {
    const res = await request
      .post('/api/contracts')
      .send({ ...validContractBase(), basic_salary_mur: 20000 });

    expect(mockedModels.SystemConfig.findOne).toHaveBeenCalled();
    // Contract.findOne is the first DB call in createContract
    expect(mockedModels.Contract.findOne).toHaveBeenCalled();
    if (res.status === 400) {
      expect(res.body.message).not.toMatch(/salary|finite|negative|minimum/i);
    }
  });

  it('TC-A03-013: contract POST with invalid basic_salary_mur cannot be bypassed via salary_monthly', async () => {
    const res = await request
      .post('/api/contracts')
      .send({
        profile_id:       1,
        contract_type:    'FULL_TIME',
        basic_salary_mur: -50,     // invalid: negative
        salary_monthly:   50000,   // valid, but wrong field for this route
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/must not be negative/i);
    // Controller was never entered
    expect(mockedModels.Contract.create).not.toHaveBeenCalled();
  });
});
