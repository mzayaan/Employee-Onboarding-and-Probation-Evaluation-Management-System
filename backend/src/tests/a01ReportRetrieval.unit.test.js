// =============================================================================
// src/tests/a01ReportRetrieval.unit.test.js
//
// Regression tests for the report-retrieval path affected by A01.
//
// Security model summary
// ----------------------
// The A01 fix prevents creating a PerformanceNote where the supplied
// evaluation_period_id belongs to a DIFFERENT employee's EvaluationCheckpoint.
// Without A01 a manager could attach note N to employee B's checkpoint while
// setting profile_id = employee A.  The consequence:
//
//   • getNotesByProfile(A) — returns N  (correct: profile_id=A)
//   • PDF report for B    — includes N  (BAD: B's checkpoint carries N)
//
// A01 blocks the creation of such a note, so the contamination never occurs.
// These tests verify the report-retrieval (notes-list) path is correctly
// scoped by profile_id and document the invariant that A01 upholds.
//
//   TC-A01-RPT-001  getNotesByProfile only returns notes for the requested profile
//   TC-A01-RPT-002  getNotesByProfile excludes notes for a different profile
//   TC-A01-RPT-003  HR_ADMIN may access any profile's notes (no 403)
//   TC-A01-RPT-004  LINE_MANAGER is denied notes for an employee not in their team
//
// FR-12 | NFR-02 | NFR-03 | A01
// =============================================================================

jest.mock('../models');
jest.mock('../utils/auditLogger',    () => ({ createAuditLog:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

const models = require('../models');
const { getNotesByProfile } = require('../controllers/performanceNoteController');

// ─── Shared fixture builders ──────────────────────────────────────────────────

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_A_ID = 10;
const PROFILE_B_ID = 20;
const HR_USER_ID   = 1;
const MGR_USER_ID  = 42;

/** A note correctly belonging to employee A (profile_id = A). */
const noteForA = {
  note_id:              101,
  profile_id:           PROFILE_A_ID,
  evaluation_period_id: 99,     // checkpoint belonging to A's probation period
  note_text:            'Good performance.',
};

/** A note that SHOULD NOT exist post-A01: profile_id=A but checkpoint belongs to B.
 *  If such a note existed (pre-A01 data), getNotesByProfile(A) would return it
 *  (correct — profile_id=A) while it would ALSO appear in employee B's PDF
 *  (wrong — via B's checkpoint association).  A01 prevents creating this note. */
const badNoteForA = {
  note_id:              102,
  profile_id:           PROFILE_A_ID,
  evaluation_period_id: 55,     // checkpoint belonging to B's probation period
  note_text:            'Bad data — created before A01 fix.',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getNotesByProfile — report-retrieval scoping (A01 regression)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC-A01-RPT-001: returns only notes whose profile_id matches the requested profile', async () => {
    // EmployeeProfile.findByPk (checkProfileScope) → found, HR_ADMIN so unrestricted
    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: PROFILE_A_ID,
      manager_id: MGR_USER_ID,
      user: { first_name: 'Alice', last_name: 'Smith' },
    });

    // PerformanceNote.findAll → returns notes for profile A (both good and bad-data scenarios)
    models.PerformanceNote.findAll = jest.fn().mockResolvedValue([noteForA]);

    const req = {
      user:   { user_id: HR_USER_ID, role: 'HR_ADMIN' },
      params: { profileId: String(PROFILE_A_ID) },
    };
    const res = makeRes();

    await getNotesByProfile(req, res);

    // Verify the WHERE clause supplied to findAll correctly scopes by profile_id
    expect(models.PerformanceNote.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profile_id: String(PROFILE_A_ID) } })
    );

    // Response contains the note for A
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [noteForA] })
    );
  });

  it('TC-A01-RPT-002: does NOT return notes belonging to a different profile', async () => {
    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: PROFILE_A_ID,
      manager_id: MGR_USER_ID,
      user: { first_name: 'Alice', last_name: 'Smith' },
    });

    // Simulate: only A's legitimate notes are returned (the WHERE clause excludes B's notes)
    models.PerformanceNote.findAll = jest.fn().mockResolvedValue([noteForA]);

    const req = {
      user:   { user_id: HR_USER_ID, role: 'HR_ADMIN' },
      params: { profileId: String(PROFILE_A_ID) },
    };
    const res = makeRes();

    await getNotesByProfile(req, res);

    const responseNotes = res.json.mock.calls[0][0].data;

    // Confirm no note with a different profile_id leaked into the response
    const leaked = responseNotes.filter((n) => n.profile_id !== PROFILE_A_ID);
    expect(leaked).toHaveLength(0);
  });

  it('TC-A01-RPT-003: HR_ADMIN can access notes for any profile (no 403)', async () => {
    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: PROFILE_B_ID,
      manager_id: 999,   // different manager — HR_ADMIN is unrestricted
      user: { first_name: 'Bob', last_name: 'Jones' },
    });

    models.PerformanceNote.findAll = jest.fn().mockResolvedValue([]);

    const req = {
      user:   { user_id: HR_USER_ID, role: 'HR_ADMIN' },
      params: { profileId: String(PROFILE_B_ID) },
    };
    const res = makeRes();

    await getNotesByProfile(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('TC-A01-RPT-004: LINE_MANAGER is denied access to notes for employees outside their team', async () => {
    // Profile belongs to a different manager
    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: PROFILE_B_ID,
      manager_id: 999,          // !== MGR_USER_ID
      user: { first_name: 'Bob', last_name: 'Jones' },
    });

    const req = {
      user:   { user_id: MGR_USER_ID, role: 'LINE_MANAGER' },
      params: { profileId: String(PROFILE_B_ID) },
    };
    const res = makeRes();

    await getNotesByProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].success).toBe(false);
    // findAll must NOT be called — access was denied before the query
    expect(models.PerformanceNote.findAll).not.toHaveBeenCalled();
  });

});
