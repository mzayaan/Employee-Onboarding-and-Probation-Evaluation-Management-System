// =============================================================================
// src/tests/a01CheckpointOwnership.unit.test.js
//
// Controller-level regression tests for A01 cross-employee checkpoint fix.
// Verifies that createNote and addEmployeeFeedback reject evaluation_period_id
// values that belong to a different employee's probation period.
//
//   createNote (performanceNoteController.js)
//     TC-A01-001  Same-employee evaluation_period_id succeeds (creates note)
//     TC-A01-002  Cross-employee evaluation_period_id returns 403, no record
//     TC-A01-003  Missing checkpoint returns 400 (pre-existing guard)
//     TC-A01-004  Null evaluation_period_id is accepted (note without checkpoint)
//
//   addEmployeeFeedback (performanceNoteController.js)
//     TC-A01-011  Same-employee evaluation_period_id succeeds (creates feedback)
//     TC-A01-012  Cross-employee evaluation_period_id returns 403, no record
//     TC-A01-013  Missing checkpoint returns 400 (pre-existing guard)
//     TC-A01-014  Null evaluation_period_id is accepted (feedback without checkpoint)
//
// FR-12 | NFR-02 | NFR-03 | A01
//
// Mock-pattern note:
//   The controllers destructure models at require-time, so the references held
//   inside each controller point to the auto-mock objects, not to any new object
//   we might assign.  We therefore MUTATE properties on the existing auto-mock
//   objects (models.X.method = jest.fn()) rather than replacing them wholesale
//   (models.X = { … }).
// =============================================================================

jest.mock('../models');
jest.mock('../utils/auditLogger',    () => ({ createAuditLog:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

const models = require('../models');
const { createNote, addEmployeeFeedback } = require('../controllers/performanceNoteController');

// ─── Shared fixture builders ──────────────────────────────────────────────────

/** Build res spy. */
const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Build a checkpoint mock whose probationPeriod.profile_id matches ownerProfileId.
 * When ownerProfileId is null the checkpoint has no nested probationPeriod.
 */
const makeCheckpoint = (ownerProfileId) => ({
  checkpoint_id:    99,
  checkpoint_label: '30 Day',
  probationPeriod:  ownerProfileId !== null
    ? { profile_id: ownerProfileId }
    : null,
});

// ─── createNote tests ─────────────────────────────────────────────────────────

describe('createNote — A01 checkpoint ownership', () => {
  const MANAGER_USER_ID     = 42;
  const EMPLOYEE_PROFILE_ID = 10;
  const OTHER_PROFILE_ID    = 99;

  beforeEach(() => {
    jest.clearAllMocks();

    // checkProfileScope calls EmployeeProfile.findByPk — mutate the auto-mock
    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: EMPLOYEE_PROFILE_ID,
      manager_id: MANAGER_USER_ID,
      user_id:    100,
    });
    // EmployeeProfile.findByPk is also called after create to send a notification
    // The second call returns the same object; mockResolvedValue satisfies both.

    models.PerformanceNote.create = jest.fn().mockResolvedValue({
      note_id:    1,
      profile_id: EMPLOYEE_PROFILE_ID,
    });
  });

  it('TC-A01-001: same-employee evaluation_period_id creates the note (HTTP 201)', async () => {
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(
      makeCheckpoint(EMPLOYEE_PROFILE_ID)
    );

    const req = {
      user:    { user_id: MANAGER_USER_ID, role: 'LINE_MANAGER', first_name: 'Bob', last_name: 'Jones' },
      headers: {},
      socket:  { remoteAddress: '127.0.0.1' },
      body: {
        profile_id:           EMPLOYEE_PROFILE_ID,
        note_text:            'Good progress this week.',
        evaluation_period_id: 99,
      },
    };
    const res = makeRes();

    await createNote(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.PerformanceNote.create).toHaveBeenCalledTimes(1);
  });

  it('TC-A01-002: cross-employee evaluation_period_id returns 403 without creating a note', async () => {
    // Checkpoint belongs to a DIFFERENT employee
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(
      makeCheckpoint(OTHER_PROFILE_ID)
    );

    const req = {
      user: { user_id: MANAGER_USER_ID, role: 'LINE_MANAGER', first_name: 'Bob', last_name: 'Jones' },
      body: {
        profile_id:           EMPLOYEE_PROFILE_ID,
        note_text:            'Note for employee A, checkpoint from employee B.',
        evaluation_period_id: 99,
      },
    };
    const res = makeRes();

    await createNote(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].success).toBe(false);
    expect(models.PerformanceNote.create).not.toHaveBeenCalled();
  });

  it('TC-A01-003: non-existent checkpoint returns 400', async () => {
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(null);

    const req = {
      user: { user_id: MANAGER_USER_ID, role: 'LINE_MANAGER', first_name: 'Bob', last_name: 'Jones' },
      body: {
        profile_id:           EMPLOYEE_PROFILE_ID,
        note_text:            'Some note.',
        evaluation_period_id: 999,
      },
    };
    const res = makeRes();

    await createNote(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.PerformanceNote.create).not.toHaveBeenCalled();
  });

  it('TC-A01-004: null evaluation_period_id is accepted (note without checkpoint)', async () => {
    // EvaluationCheckpoint.findByPk must NOT be called at all
    models.EvaluationCheckpoint.findByPk = jest.fn();

    const req = {
      user:    { user_id: MANAGER_USER_ID, role: 'LINE_MANAGER', first_name: 'Bob', last_name: 'Jones' },
      headers: {},
      socket:  { remoteAddress: '127.0.0.1' },
      body: {
        profile_id:           EMPLOYEE_PROFILE_ID,
        note_text:            'General performance note.',
        evaluation_period_id: null,
      },
    };
    const res = makeRes();

    await createNote(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.EvaluationCheckpoint.findByPk).not.toHaveBeenCalled();
    expect(models.PerformanceNote.create).toHaveBeenCalledTimes(1);
  });
});

// ─── addEmployeeFeedback tests ────────────────────────────────────────────────

describe('addEmployeeFeedback — A01 checkpoint ownership', () => {
  const EMPLOYEE_USER_ID = 100;
  const EMPLOYEE_PROFILE = { profile_id: 10, user_id: EMPLOYEE_USER_ID, manager_id: 42 };
  const OTHER_PROFILE_ID = 77;

  beforeEach(() => {
    jest.clearAllMocks();

    // addEmployeeFeedback starts with EmployeeProfile.findOne to get the caller's profile
    models.EmployeeProfile.findOne = jest.fn().mockResolvedValue(EMPLOYEE_PROFILE);

    // After create, findByPk re-fetches the note with the recorder association
    models.PerformanceNote.create   = jest.fn().mockResolvedValue({ note_id: 5, profile_id: EMPLOYEE_PROFILE.profile_id });
    models.PerformanceNote.findByPk = jest.fn().mockResolvedValue({ note_id: 5, profile_id: EMPLOYEE_PROFILE.profile_id });
  });

  it('TC-A01-011: same-employee evaluation_period_id creates feedback (HTTP 201)', async () => {
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(
      makeCheckpoint(EMPLOYEE_PROFILE.profile_id)
    );

    const req = {
      user:    { user_id: EMPLOYEE_USER_ID, role: 'NEW_EMPLOYEE', first_name: 'Alice', last_name: 'Smith' },
      headers: {},
      socket:  { remoteAddress: '127.0.0.1' },
      body: { note_text: 'I feel the workload is manageable.', evaluation_period_id: 99 },
    };
    const res = makeRes();

    await addEmployeeFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.PerformanceNote.create).toHaveBeenCalledTimes(1);
  });

  it('TC-A01-012: cross-employee evaluation_period_id returns 403 without creating feedback', async () => {
    // Checkpoint belongs to a different employee
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(
      makeCheckpoint(OTHER_PROFILE_ID)
    );

    const req = {
      user: { user_id: EMPLOYEE_USER_ID, role: 'NEW_EMPLOYEE', first_name: 'Alice', last_name: 'Smith' },
      body: { note_text: 'Feedback attempt on another employee checkpoint.', evaluation_period_id: 99 },
    };
    const res = makeRes();

    await addEmployeeFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].success).toBe(false);
    expect(models.PerformanceNote.create).not.toHaveBeenCalled();
  });

  it('TC-A01-013: non-existent checkpoint returns 400', async () => {
    models.EvaluationCheckpoint.findByPk = jest.fn().mockResolvedValue(null);

    const req = {
      user: { user_id: EMPLOYEE_USER_ID, role: 'NEW_EMPLOYEE', first_name: 'Alice', last_name: 'Smith' },
      body: { note_text: 'Feedback.', evaluation_period_id: 999 },
    };
    const res = makeRes();

    await addEmployeeFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.PerformanceNote.create).not.toHaveBeenCalled();
  });

  it('TC-A01-014: null evaluation_period_id is accepted (feedback without checkpoint)', async () => {
    // EvaluationCheckpoint.findByPk must NOT be called at all
    models.EvaluationCheckpoint.findByPk = jest.fn();

    const req = {
      user:    { user_id: EMPLOYEE_USER_ID, role: 'NEW_EMPLOYEE', first_name: 'Alice', last_name: 'Smith' },
      headers: {},
      socket:  { remoteAddress: '127.0.0.1' },
      body: { note_text: 'General feedback.', evaluation_period_id: null },
    };
    const res = makeRes();

    await addEmployeeFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.EvaluationCheckpoint.findByPk).not.toHaveBeenCalled();
    expect(models.PerformanceNote.create).toHaveBeenCalledTimes(1);
  });
});
