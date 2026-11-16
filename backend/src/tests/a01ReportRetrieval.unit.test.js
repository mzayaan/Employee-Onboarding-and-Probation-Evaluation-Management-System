// =============================================================================
// src/tests/a01ReportRetrieval.unit.test.js
//
// Regression tests for the report-retrieval path affected by A01.
//
// Security model summary
// ----------------------
// A01 prevents creating a PerformanceNote where the supplied
// evaluation_period_id belongs to a DIFFERENT employee's EvaluationCheckpoint.
// Without A01 a manager could attach note N to employee B's checkpoint while
// setting profile_id = employee A.  The consequence:
//
//   • getNotesByProfile(A) — returns N  (correct: profile_id=A)
//   • PDF report for B    — includes N  (BAD: B's checkpoint carries N)
//
// A01 blocks the creation of such a note, so the contamination never occurs.
// But pre-fix data (or a future regression) could still place a "bad" note in
// the database.  pdfController.collectNotesForPDF therefore adds a third filter
// layer (A01-PDF) that excludes any note whose profile_id !== empProfileId
// regardless of which checkpoint it is attached to.
//
//  Part A — getNotesByProfile scoping (FR-12 / NFR-03)
//    TC-A01-RPT-001  returns notes for the requested profile
//    TC-A01-RPT-002  does not return notes for a different profile
//    TC-A01-RPT-003  HR_ADMIN may access any profile's notes
//    TC-A01-RPT-004  LINE_MANAGER is denied notes outside their team
//
//  Part B — collectNotesForPDF PDF note retrieval filter (A01-PDF)
//    TC-A01-PDF-001  includes notes whose profile_id matches empProfileId
//    TC-A01-PDF-002  excludes notes whose profile_id does NOT match (cross-employee fixture)
//    TC-A01-PDF-003  excludes notes created after cycleDecisionAt even if profile_id matches
//    TC-A01-PDF-004  handles empty performanceNotes gracefully
//    TC-A01-PDF-005  excludes note with correct timestamp but wrong profile_id simultaneously
//
// FR-12 | FR-16 | NFR-02 | NFR-03 | A01 | A01-PDF
// =============================================================================

jest.mock('../models');
jest.mock('../utils/auditLogger',    () => ({ createAuditLog:    jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));

const models = require('../models');
const { getNotesByProfile }     = require('../controllers/performanceNoteController');
const { collectNotesForPDF }    = require('../controllers/pdfController');

// ─── Shared fixture builders ──────────────────────────────────────────────────

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PROFILE_A_ID     = 10;
const PROFILE_B_ID     = 20;
const CHECKPOINT_B_ID  = 55;   // checkpoint belonging to employee B's probation
const CHECKPOINT_A_ID  = 99;   // checkpoint belonging to employee A's probation
const HR_USER_ID       = 1;
const MGR_USER_ID      = 42;

// ─────────────────────────────────────────────────────────────────────────────
// PART A — getNotesByProfile scoping
// ─────────────────────────────────────────────────────────────────────────────

describe('getNotesByProfile — report-retrieval scoping (A01 regression)', () => {

  /** A note correctly belonging to employee A (profile_id = A). */
  const noteForA = {
    note_id:              101,
    profile_id:           PROFILE_A_ID,
    evaluation_period_id: CHECKPOINT_A_ID,
    note_text:            'Good performance.',
  };

  beforeEach(() => { jest.clearAllMocks(); });

  it('TC-A01-RPT-001: returns only notes whose profile_id matches the requested profile', async () => {
    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: PROFILE_A_ID,
      manager_id: MGR_USER_ID,
      user: { first_name: 'Alice', last_name: 'Smith' },
    });
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
    models.PerformanceNote.findAll = jest.fn().mockResolvedValue([noteForA]);

    const req = {
      user:   { user_id: HR_USER_ID, role: 'HR_ADMIN' },
      params: { profileId: String(PROFILE_A_ID) },
    };
    const res = makeRes();

    await getNotesByProfile(req, res);

    const responseNotes = res.json.mock.calls[0][0].data;
    const leaked = responseNotes.filter((n) => n.profile_id !== PROFILE_A_ID);
    expect(leaked).toHaveLength(0);
  });

  it('TC-A01-RPT-003: HR_ADMIN can access notes for any profile (no 403)', async () => {
    models.EmployeeProfile.findByPk = jest.fn().mockResolvedValue({
      profile_id: PROFILE_B_ID,
      manager_id: 999,
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('TC-A01-RPT-004: LINE_MANAGER is denied access to notes for employees outside their team', async () => {
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
    expect(models.PerformanceNote.findAll).not.toHaveBeenCalled();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// PART B — collectNotesForPDF PDF note retrieval filter (A01-PDF regression)
//
// These tests exercise the ACTUAL path that determines which notes enter
// an employee's PDF report.  The fixture uses a "bad" note whose profile_id
// belongs to employee A but whose evaluation_period_id belongs to employee B's
// checkpoint.  Without the A01-PDF filter that note would appear in employee
// B's PDF; with the fix it must be excluded.
// ─────────────────────────────────────────────────────────────────────────────

describe('collectNotesForPDF — PDF note retrieval filter (A01-PDF regression)', () => {

  const PAST_DATE   = new Date('2024-01-01T00:00:00Z');
  const CYCLE_CUT   = new Date('2024-06-01T00:00:00Z');
  const FUTURE_DATE = new Date('2024-12-01T00:00:00Z');

  /** A legitimate note for employee B, inside the cycle window. */
  const goodNote = {
    note_id:              201,
    profile_id:           PROFILE_B_ID,
    evaluation_period_id: CHECKPOINT_B_ID,
    note_text:            'On track.',
    created_at:           PAST_DATE,
  };

  /**
   * TC-A01-PDF-002 fixture: an orphan note created PRE-A01 (or hypothetical
   * regression).  profile_id=A means it belongs to employee A, but it is
   * attached to employee B's checkpoint (evaluation_period_id=CHECKPOINT_B_ID).
   * Without the A01-PDF filter it would appear in employee B's PDF.
   */
  const badNote = {
    note_id:              202,
    profile_id:           PROFILE_A_ID,          // ← WRONG profile
    evaluation_period_id: CHECKPOINT_B_ID,       // ← B's checkpoint
    note_text:            'Cross-employee orphan — MUST NOT appear in B PDF.',
    created_at:           PAST_DATE,
  };

  /** A legitimate note for B but created after the cycle boundary. */
  const lateNote = {
    note_id:              203,
    profile_id:           PROFILE_B_ID,
    evaluation_period_id: CHECKPOINT_B_ID,
    note_text:            'Written after Director approval — must be excluded.',
    created_at:           FUTURE_DATE,
  };

  /** Checkpoint belonging to employee B with both a good and an orphan note. */
  const checkpointB = {
    evaluation_period_id: CHECKPOINT_B_ID,
    checkpoint_label:     'CP-30',
    performanceNotes:     [goodNote, badNote],
  };

  it('TC-A01-PDF-001: includes notes whose profile_id matches empProfileId', () => {
    const result = collectNotesForPDF([checkpointB], PROFILE_B_ID, null);

    // The good note (profile_id=B) must appear
    const ids = result.map((n) => n.note_id);
    expect(ids).toContain(goodNote.note_id);
  });

  it('TC-A01-PDF-002: excludes notes whose profile_id does NOT match empProfileId (cross-employee fixture)', () => {
    // Core security regression: badNote.profile_id = A_ID, checkpoint belongs to B.
    // collectNotesForPDF is called for employee B (empProfileId = PROFILE_B_ID).
    // The bad note MUST be excluded.
    const result = collectNotesForPDF([checkpointB], PROFILE_B_ID, null);

    const ids = result.map((n) => n.note_id);
    expect(ids).not.toContain(badNote.note_id);
    // Also verify the note text is not in any result entry
    const texts = result.map((n) => n.note_text);
    expect(texts).not.toContain(badNote.note_text);
  });

  it('TC-A01-PDF-003: excludes notes created after cycleDecisionAt even if profile_id matches', () => {
    const cpWithLateNote = {
      ...checkpointB,
      performanceNotes: [goodNote, lateNote],
    };

    const result = collectNotesForPDF([cpWithLateNote], PROFILE_B_ID, CYCLE_CUT);

    const ids = result.map((n) => n.note_id);
    expect(ids).toContain(goodNote.note_id);       // before cut: included
    expect(ids).not.toContain(lateNote.note_id);   // after cut:  excluded
  });

  it('TC-A01-PDF-004: handles a checkpoint with no performanceNotes gracefully', () => {
    const emptyCheckpoint = {
      evaluation_period_id: CHECKPOINT_B_ID,
      checkpoint_label:     'CP-30',
      performanceNotes:     undefined,             // may be undefined from ORM
    };

    expect(() => collectNotesForPDF([emptyCheckpoint], PROFILE_B_ID, null)).not.toThrow();
    const result = collectNotesForPDF([emptyCheckpoint], PROFILE_B_ID, null);
    expect(result).toHaveLength(0);
  });

  it('TC-A01-PDF-005: excludes a note that fails BOTH time and profile_id checks simultaneously', () => {
    // Worst-case: profile_id wrong AND created after cycle boundary
    const doubleOrphan = {
      note_id:    204,
      profile_id: PROFILE_A_ID,
      evaluation_period_id: CHECKPOINT_B_ID,
      note_text:  'Double-fail note.',
      created_at: FUTURE_DATE,
    };
    const cp = { ...checkpointB, performanceNotes: [goodNote, doubleOrphan] };

    const result = collectNotesForPDF([cp], PROFILE_B_ID, CYCLE_CUT);

    const ids = result.map((n) => n.note_id);
    expect(ids).toContain(goodNote.note_id);
    expect(ids).not.toContain(doubleOrphan.note_id);
  });

});
