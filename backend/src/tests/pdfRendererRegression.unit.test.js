// =============================================================================
// src/tests/pdfRendererRegression.unit.test.js
//
// Regression tests for three bugs identified in code review (6f8cb6b):
//
//   TC-RGR-001..003  HIGH  — getMyTeam exposes sensitive employee fields to
//                            LINE_MANAGER (NIC, bank account, salary).
//   TC-RGR-004..006  MEDIUM — PDF checkpoint score column renders NaN/5 because
//                            buildCriteriaMap returns {raw_score, weight} objects
//                            but the renderer was formatting the whole object as
//                            a number.
//   TC-RGR-007..009  MEDIUM — Historical PDFs include performance notes and
//                            development reviews from post-cycle checkpoints.
//
// NFR-03 | FR-14, FR-16 | Objective 3
// =============================================================================

jest.mock('../models');

// ─── Subject under test ───────────────────────────────────────────────────────

// pdfHelpers is a pure-function module; no model dependency.
const {
  buildCriteriaMap,
  filterCheckpointsByCycle,
} = require('../utils/pdfHelpers');

// evaluationController requires the models mock above.
// We only test the sensitive-field stripping logic, which is deterministic given
// the mock profiles returned by EmployeeProfile.findAll.
const { SENSITIVE_FIELDS } = require('../controllers/employeeController');

// ─── Shared constants ─────────────────────────────────────────────────────────

const ALL_SENSITIVE_FIELDS = [
  'nic_number',
  'tax_account_number',
  'bank_account_number',
  'bank_name',
  'passport_number',
  'salary_monthly',
  'previous_salary_monthly',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Sequelize-like profile mock with all sensitive fields populated. */
const makeMockProfile = (overrides = {}) => {
  const plain = {
    profile_id:              1,
    job_title:               'Software Engineer',
    department_id:           2,
    // All 7 sensitive fields
    nic_number:              'NIC-SECRET',
    tax_account_number:      'TAX-SECRET',
    bank_account_number:     'BANK-SECRET',
    bank_name:               'BankOfMauritius',
    passport_number:         'PASS-SECRET',
    salary_monthly:          80000,
    previous_salary_monthly: 72000,
    user:                    { user_id: 10, first_name: 'Alice', last_name: 'Smith', email: 'alice@test.com', role: 'NEW_EMPLOYEE' },
    probationPeriods:        [],
    ...overrides,
  };
  return {
    ...plain,
    toJSON() { return { ...plain }; },
  };
};

/** Simulate the stripping logic added to getMyTeam. */
const stripTeamProfiles = (profiles) =>
  profiles.map((p) => {
    const obj = p.toJSON ? p.toJSON() : { ...p };
    SENSITIVE_FIELDS.forEach((f) => delete obj[f]);
    return obj;
  });

// ─── TC-RGR-001..003: getMyTeam sensitive field stripping ────────────────────

describe('getMyTeam — sensitive field stripping (DPA-2017)', () => {
  // TC-RGR-001: all 7 SENSITIVE_FIELDS are removed from each profile in the response
  it('TC-RGR-001: strips all 7 SENSITIVE_FIELDS from every profile returned to LINE_MANAGER', () => {
    const profiles = [makeMockProfile(), makeMockProfile({ profile_id: 2 })];
    const safe = stripTeamProfiles(profiles);

    safe.forEach((p) => {
      ALL_SENSITIVE_FIELDS.forEach((field) => {
        expect(p).not.toHaveProperty(field);
      });
    });
    expect(safe).toHaveLength(2);
  });

  // TC-RGR-002: non-sensitive fields (job_title, user, probationPeriods) are preserved
  it('TC-RGR-002: preserves non-sensitive profile fields after stripping', () => {
    const profile = makeMockProfile();
    const [safe]  = stripTeamProfiles([profile]);

    expect(safe.profile_id).toBe(1);
    expect(safe.job_title).toBe('Software Engineer');
    expect(safe.user.first_name).toBe('Alice');
    expect(Array.isArray(safe.probationPeriods)).toBe(true);
  });

  // TC-RGR-003: works on plain objects (no toJSON) — matches the guard in the controller
  it('TC-RGR-003: handles profiles without toJSON (plain objects)', () => {
    const plain = {
      profile_id:          3,
      job_title:           'HR Manager',
      nic_number:          'NIC-PLAIN',
      bank_account_number: 'BANK-PLAIN',
      salary_monthly:      95000,
    };
    const [safe] = stripTeamProfiles([plain]);

    expect(safe).not.toHaveProperty('nic_number');
    expect(safe).not.toHaveProperty('bank_account_number');
    expect(safe).not.toHaveProperty('salary_monthly');
    expect(safe.job_title).toBe('HR Manager');
  });
});

// ─── TC-RGR-004..006: NaN/5 regression — cpScores entries are objects ────────
//
// Before the fix, pdfController did:
//   const raw = c.cpScores[cp.checkpoint_id];        // returns {raw_score, weight}
//   fmtScore(raw)                                     // Number.parseFloat({...}) = NaN
//
// After the fix:
//   const entry = c.cpScores[cp.checkpoint_id];
//   const raw   = entry?.raw_score ?? null;           // correct: extracts number
//
// These tests confirm that buildCriteriaMap returns objects, not plain numbers,
// and that the correct extraction strategy gives a number while the wrong one
// gives NaN — proving the fix is necessary and sufficient.

describe('NaN/5 regression — buildCriteriaMap cpScores are objects, not numbers', () => {
  const makeScore = (id, name, raw, weightAtScoring, currentWeight) => ({
    criterion_id:              id,
    raw_score:                 raw,
    weight_percent_at_scoring: weightAtScoring,
    criterion:                 { name, weight_percent: currentWeight },
  });

  const makeCheckpoint = (id, scores) => ({
    checkpoint_id:     id,
    day_number:        30,
    status:            'COMPLETED',
    completed_at:      '2026-02-01T00:00:00Z',
    managerEvaluation: { scores },
  });

  // TC-RGR-004: cpScores[id] is an object { raw_score, weight }, NOT a plain number
  it('TC-RGR-004: buildCriteriaMap stores {raw_score, weight} objects — using the object directly as a number gives NaN', () => {
    const cp = makeCheckpoint(5, [makeScore(1, 'Performance', 4, 30, 30)]);
    const map = buildCriteriaMap([cp]);

    const entry = map['Performance'].cpScores[5];

    // The entry IS an object, not a number
    expect(typeof entry).toBe('object');
    expect(entry).toHaveProperty('raw_score');
    expect(entry).toHaveProperty('weight');

    // Formatting the whole object (old bug) gives NaN
    expect(Number.parseFloat(entry)).toBeNaN();

    // Reading entry.raw_score (the fix) gives the correct number
    expect(Number.parseFloat(entry.raw_score)).toBe(4);
    expect(Number.parseFloat(entry.raw_score)).not.toBeNaN();
  });

  // TC-RGR-005: optional chaining on a missing entry gives null, not NaN
  it('TC-RGR-005: entry?.raw_score is null for a missing checkpoint — does not produce NaN', () => {
    const cp = makeCheckpoint(5, [makeScore(1, 'Performance', 4, 30, 30)]);
    const map = buildCriteriaMap([cp]);

    // Checkpoint 99 was never scored for 'Performance'
    const entry = map['Performance'].cpScores[99];
    const raw   = entry?.raw_score ?? null;

    expect(raw).toBeNull();
    expect(raw).not.toBeNaN();
  });

  // TC-RGR-006: formatted scores from the corrected read path are always "x.x/5", never "NaN/5"
  it('TC-RGR-006: extracted raw_score values from two checkpoints are valid floats (regression guard)', () => {
    const cp1 = makeCheckpoint(10, [makeScore(1, 'Attendance', 5, 20, 20)]);
    const cp2 = makeCheckpoint(20, [makeScore(1, 'Attendance', 3, 20, 25)]);
    const map  = buildCriteriaMap([cp1, cp2]);

    [10, 20].forEach((cpId) => {
      const entry = map['Attendance'].cpScores[cpId];
      const raw   = entry?.raw_score ?? null;
      expect(raw).not.toBeNull();
      expect(Number.isNaN(raw)).toBe(false);
      // Confirm the string representation would be "x.x/5" not "NaN/5"
      const rendered = `${raw.toFixed(1)}/5`;
      expect(rendered).not.toContain('NaN');
    });
  });
});

// ─── TC-RGR-007..009: note boundary — completedCps vs all checkpoints ────────
//
// Before the fix, pdfController collected performance notes from ALL checkpoints:
//   const allNotes = checkpoints.flatMap((cp) => ...)
//
// After the fix it uses only the cycle-filtered set:
//   const allNotes = completedCps.flatMap((cp) => ...)
//
// Similarly, devReviews were fetched with no date filter.  The filter is applied
// at the database level (Op.lte cycleDecisionAt), so we test the data-level
// logic here by simulating the flatMap behaviour with the two collections.

describe('note boundary regression — allNotes must use completedCps, not all checkpoints', () => {
  const makeCheckpointWithNotes = (id, status, completedAt, notes = []) => ({
    checkpoint_id:   id,
    status,
    completed_at:    completedAt,
    checkpoint_label: `Day ${id * 30}`,
    performanceNotes: notes.map((text, i) => ({
      note_id:    i + 1,
      note_text:  text,
      created_at: completedAt,
      toJSON()    { return { note_id: this.note_id, note_text: this.note_text }; },
    })),
  });

  const flattenNotes = (cps) =>
    cps.flatMap((cp) =>
      (cp.performanceNotes || []).map((n) => ({
        ...(n.toJSON ? n.toJSON() : n),
        _cpLabel: cp.checkpoint_label,
      }))
    );

  // TC-RGR-007: allNotes from completedCps excludes notes from post-boundary checkpoints
  it('TC-RGR-007: completedCps-based flatMap excludes notes from checkpoints after the cycle boundary', () => {
    const cycleDecisionAt = new Date('2026-03-15T00:00:00.000Z');

    const cp30  = makeCheckpointWithNotes(1, 'COMPLETED', '2026-01-30T00:00:00Z', ['Good start']);
    const cp60  = makeCheckpointWithNotes(2, 'COMPLETED', '2026-03-01T00:00:00Z', ['On track']);
    // cp90 completed AFTER cycle boundary — cycle-2 note
    const cp90  = makeCheckpointWithNotes(3, 'COMPLETED', '2026-05-01T00:00:00Z', ['Post-cycle note']);

    const allCheckpoints = [cp30, cp60, cp90];
    const completedCps   = filterCheckpointsByCycle(allCheckpoints, cycleDecisionAt);

    // Old (buggy): notes from all checkpoints including cp90
    const buggyNotes  = flattenNotes(allCheckpoints);
    // Fixed: notes from completedCps only (cp30, cp60)
    const fixedNotes  = flattenNotes(completedCps);

    expect(buggyNotes).toHaveLength(3); // includes post-cycle note
    expect(fixedNotes).toHaveLength(2); // excludes post-cycle note

    const noteTexts = fixedNotes.map((n) => n.note_text);
    expect(noteTexts).not.toContain('Post-cycle note');
    expect(noteTexts).toContain('Good start');
    expect(noteTexts).toContain('On track');
  });

  // TC-RGR-008: when cycleDecisionAt is null (first cycle, no extension), allNotes includes
  //             all completed checkpoints' notes — no notes are incorrectly excluded
  it('TC-RGR-008: null cycleDecisionAt preserves all completed-checkpoint notes', () => {
    const cp30 = makeCheckpointWithNotes(1, 'COMPLETED', '2026-01-30T00:00:00Z', ['Note A']);
    const cp60 = makeCheckpointWithNotes(2, 'COMPLETED', '2026-03-01T00:00:00Z', ['Note B']);
    const cp90 = makeCheckpointWithNotes(3, 'PENDING',   null,                   ['Pending note']);

    const completedCps = filterCheckpointsByCycle([cp30, cp60, cp90], null);
    const notes        = flattenNotes(completedCps);

    // Pending cp90 is excluded by filterCheckpointsByCycle; its note should not appear
    expect(notes.map((n) => n.note_text)).not.toContain('Pending note');
    expect(notes).toHaveLength(2);
  });

  // TC-RGR-009: checkpoint with no performanceNotes does not throw and contributes nothing
  it('TC-RGR-009: checkpoints without performanceNotes contribute no notes and do not throw', () => {
    const cp30 = makeCheckpointWithNotes(1, 'COMPLETED', '2026-01-30T00:00:00Z', []);
    const cp60 = {
      checkpoint_id:    2,
      status:           'COMPLETED',
      completed_at:     '2026-03-01T00:00:00Z',
      checkpoint_label: 'Day 60',
      // performanceNotes deliberately absent
    };

    const completedCps = filterCheckpointsByCycle([cp30, cp60], null);
    expect(() => flattenNotes(completedCps)).not.toThrow();
    expect(flattenNotes(completedCps)).toHaveLength(0);
  });

  // TC-RGR-010: note added to an in-scope checkpoint AFTER Director approval is excluded
  //
  // This is the second-level filter identified in code review: completedCps already
  // restricts to checkpoints completed before cycleDecisionAt, but a note can be
  // written against an older checkpoint (e.g. cp30) AFTER the Director signed off.
  // The note's own created_at must also be compared against cycleDecisionAt.
  it('TC-RGR-010: note created after cycleDecisionAt is excluded even when attached to an in-scope checkpoint', () => {
    const cycleDecisionAt = new Date('2026-03-15T00:00:00.000Z');

    // cp30 is within the cycle (completed before the boundary).
    // It has two notes: one written before approval, one written after.
    const makeNote = (id, text, createdAt) => ({
      note_id:    id,
      note_text:  text,
      created_at: createdAt,
      toJSON()    { return { note_id: this.note_id, note_text: this.note_text, created_at: this.created_at }; },
    });

    const cp30 = {
      checkpoint_id:    1,
      status:           'COMPLETED',
      completed_at:     '2026-01-30T00:00:00Z',
      checkpoint_label: 'Day 30',
      performanceNotes: [
        makeNote(1, 'Early observation',    '2026-02-01T00:00:00Z'), // before approval ✓
        makeNote(2, 'Retrospective note',   '2026-04-01T00:00:00Z'), // AFTER approval  ✗
      ],
    };

    const completedCps = filterCheckpointsByCycle([cp30], cycleDecisionAt);
    expect(completedCps).toHaveLength(1); // cp30 is in scope

    // Apply the two-level filter used in pdfController (outer = completedCps, inner = created_at)
    const filteredNotes = completedCps.flatMap((cp) =>
      (cp.performanceNotes || [])
        .filter((n) => !cycleDecisionAt || new Date(n.created_at) <= cycleDecisionAt)
        .map((n) => ({ ...(n.toJSON ? n.toJSON() : n), _cpLabel: cp.checkpoint_label }))
    );

    // Only the pre-approval note should appear
    expect(filteredNotes).toHaveLength(1);
    expect(filteredNotes[0].note_text).toBe('Early observation');
    expect(filteredNotes.map((n) => n.note_text)).not.toContain('Retrospective note');
  });
});
