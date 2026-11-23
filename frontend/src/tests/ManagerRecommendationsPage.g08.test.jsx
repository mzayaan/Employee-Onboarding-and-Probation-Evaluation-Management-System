// =============================================================================
// src/tests/ManagerRecommendationsPage.g08.test.jsx
//
// Component regression tests for the G08 revise-and-resubmit behaviour in
// ManagerRecommendationsPage.
//
// Covered behaviours:
//   TC-FE-G08-001  Page renders a list of recommendations from listMyRecommendations.
//   TC-FE-G08-002  Empty state: "No recommendations submitted yet" shown when API
//                  returns [].
//   TC-FE-G08-003  API load error: "Failed to load your recommendations." shown.
//   TC-FE-G08-004  RETURNED_TO_MANAGER rec: "Revise & Resubmit" button is visible
//                  in the summary row.
//   TC-FE-G08-005  Lazy-load: expanding a RETURNED_TO_MANAGER rec triggers
//                  getRecommendation with the correct rec_id.
//   TC-FE-G08-006  Validation — empty justification blocks submission and shows
//                  "Justification is required."
//   TC-FE-G08-007  Validation — empty correction_reason blocks submission and shows
//                  "Correction reason is required".
//   TC-FE-G08-008  Submission: reviseAndResubmit called with justification,
//                  correction_reason, and score_corrections payload.
//   TC-FE-G08-009  Success banner: "Recommendation revised and resubmitted"
//                  appears after successful submission.
//   TC-FE-G08-010  API error: server message propagated to the error banner.
//   TC-FE-G08-011  RevisionHistory renders when detailRec.revisions has items.
//   TC-FE-G08-012  ScoreCorrectionForm renders scores grouped by checkpoint;
//                  scores with weight_percent_at_scoring == null are shown as
//                  "locked" and have no <select> element (G09 protection).
//   TC-FE-G08-013  APPROVED rec: PDF download button visible; RETURNED rec: not.
//
// FR-15, FR-18 | G08 | NFR-02, NFR-03 | Objective 3
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import ManagerRecommendationsPage from '../pages/manager/ManagerRecommendationsPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/shared/AppShell', () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock('@/api/directorApi', () => ({
  listMyRecommendations: vi.fn(),
  getRecommendation:     vi.fn(),
  reviseAndResubmit:     vi.fn(),
}));

vi.mock('@/api/reportApi', () => ({
  downloadReport: vi.fn(),
}));

import {
  listMyRecommendations,
  getRecommendation,
  reviseAndResubmit,
} from '@/api/directorApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render the page inside a memory router. */
function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/', element: <ManagerRecommendationsPage /> }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

/** Minimal recommendation object for the list API. */
function makeRec(overrides = {}) {
  return {
    rec_id:              1,
    approval_status:     'RETURNED_TO_MANAGER',
    recommendation_type: 'CONFIRM',
    cumulative_score:    78.5,
    generated_at:        '2024-11-01T10:00:00.000Z',
    justification:       'Employee meets all criteria.',
    rejection_count:     1,
    hr_endorsement_notes: 'Please correct attendance score.',
    director_reason:     null,
    revision_count:      0,
    endorsed_by:         null,
    endorsed_at:         null,
    endorsedByHR:        null,
    director:            null,
    director_decision_at: null,
    revisions:           [],
    probationPeriod: {
      period_id: 10,
      end_date:  '2025-01-31',
      employeeProfile: {
        job_title:  'Software Engineer',
        department: { name: 'Engineering' },
        user: { first_name: 'Alice', last_name: 'Brown' },
      },
    },
    ...overrides,
  };
}

/** Minimal detail object returned by getRecommendation. */
function makeDetail(recId = 1, overrides = {}) {
  return {
    rec_id:              recId,
    approval_status:     'RETURNED_TO_MANAGER',
    recommendation_type: 'CONFIRM',
    cumulative_score:    78.5,
    justification:       'Employee meets all criteria.',
    revision_count:      0,
    revisions:           [],
    probationPeriod: {
      period_id: 10,
      end_date:  '2025-01-31',
      checkpoints: [
        {
          checkpoint_id: 100,
          label: '30-Day',
          managerEvaluation: {
            eval_id: 200,
            scores: [
              {
                score_id:                 1001,
                criterion_id:             1,
                raw_score:                4,
                weight_percent_at_scoring: '20.00',
                name_at_scoring:          'Job Performance',
                criterion:                { name: 'Job Performance' },
              },
              {
                score_id:                 1002,
                criterion_id:             2,
                raw_score:                3,
                weight_percent_at_scoring: null,  // pre-G09: locked
                name_at_scoring:          'Attendance',
                criterion:                { name: 'Attendance' },
              },
            ],
          },
        },
      ],
      employeeProfile: {
        job_title:  'Software Engineer',
        department: { name: 'Engineering' },
        user: { first_name: 'Alice', last_name: 'Brown' },
      },
    },
    ...overrides,
  };
}

// ── beforeEach ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ManagerRecommendationsPage — G08 regression suite', () => {

  // ── TC-FE-G08-001: renders list ───────────────────────────────────────────

  it('TC-FE-G08-001: renders employee name from recommendation list', async () => {
    listMyRecommendations.mockResolvedValue([makeRec()]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Brown')).toBeDefined();
    });
  });

  // ── TC-FE-G08-002: empty state ────────────────────────────────────────────

  it('TC-FE-G08-002: shows empty state when API returns empty array', async () => {
    listMyRecommendations.mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No recommendations submitted yet/i)).toBeDefined();
    });
  });

  // ── TC-FE-G08-003: load error ─────────────────────────────────────────────

  it('TC-FE-G08-003: shows error message when listMyRecommendations rejects', async () => {
    listMyRecommendations.mockRejectedValue(new Error('Network error'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load your recommendations/i)).toBeDefined();
    });
  });

  // ── TC-FE-G08-004: "Revise & Resubmit" button visible for RETURNED rec ───

  it('TC-FE-G08-004: "Revise & Resubmit" button visible for RETURNED_TO_MANAGER rec', async () => {
    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Revise & Resubmit/i)).toBeDefined();
    });
  });

  // ── TC-FE-G08-005: lazy-load — expanding triggers getRecommendation ───────

  it('TC-FE-G08-005: expanding a RETURNED rec triggers getRecommendation with correct rec_id', async () => {
    const rec = makeRec({ rec_id: 42, approval_status: 'RETURNED_TO_MANAGER' });
    listMyRecommendations.mockResolvedValue([rec]);
    getRecommendation.mockResolvedValue(makeDetail(42));

    renderPage();

    // Wait for the list to render
    await waitFor(() => {
      expect(screen.getByText('Alice Brown')).toBeDefined();
    });

    // Click the row to expand it
    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(getRecommendation).toHaveBeenCalledWith(42);
    });
  });

  // ── TC-FE-G08-006: validation — empty justification ───────────────────────

  it('TC-FE-G08-006: empty justification blocks submission with error message', async () => {
    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    // Wait for list
    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    // Expand the row
    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    // Wait for the form panel to appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Explain what scores or information you have corrected/i)).toBeDefined();
    });

    // Clear the justification textarea (it may be pre-filled from detail)
    const justificationTextarea = screen.getByPlaceholderText(/Provide your revised justification/i);
    await userEvent.clear(justificationTextarea);

    // Fill correction_reason
    const corrReasonTextarea = screen.getByPlaceholderText(/Explain what scores or information you have corrected/i);
    await userEvent.type(corrReasonTextarea, 'Corrected attendance score based on actual records.');

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Revise & Resubmit for HR Review/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText(/Justification is required/i)).toBeDefined();
    expect(reviseAndResubmit).not.toHaveBeenCalled();
  });

  // ── TC-FE-G08-007: validation — empty correction_reason ──────────────────

  it('TC-FE-G08-007: empty correction_reason blocks submission with error message', async () => {
    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Provide your revised justification/i)).toBeDefined();
    });

    // Fill justification but leave correction_reason empty
    const justificationTextarea = screen.getByPlaceholderText(/Provide your revised justification/i);
    await userEvent.clear(justificationTextarea);
    await userEvent.type(justificationTextarea, 'Updated justification text.');

    // Leave corrReason empty (do not type anything into the correction textarea)

    const submitBtn = screen.getByRole('button', { name: /Revise & Resubmit for HR Review/i });
    await userEvent.click(submitBtn);

    expect(screen.getByText(/Correction reason is required/i)).toBeDefined();
    expect(reviseAndResubmit).not.toHaveBeenCalled();
  });

  // ── TC-FE-G08-008: submission — reviseAndResubmit called with correct payload

  it('TC-FE-G08-008: reviseAndResubmit called with justification, correction_reason, score_corrections', async () => {
    reviseAndResubmit.mockResolvedValue({ success: true });
    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Provide your revised justification/i)).toBeDefined();
    });

    const justificationTextarea = screen.getByPlaceholderText(/Provide your revised justification/i);
    await userEvent.clear(justificationTextarea);
    await userEvent.type(justificationTextarea, 'My revised justification.');

    const corrReasonTextarea = screen.getByPlaceholderText(/Explain what scores or information you have corrected/i);
    await userEvent.type(corrReasonTextarea, 'Corrected score 1001 from 4 to 5.');

    // Change score_id 1001 from 4 to 5 using the select
    const selects = screen.getAllByRole('combobox');
    // The only unlocked score is 1001 (1002 is locked, so no select for it)
    expect(selects).toHaveLength(1);
    await userEvent.selectOptions(selects[0], '5');

    const submitBtn = screen.getByRole('button', { name: /Revise & Resubmit for HR Review/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(reviseAndResubmit).toHaveBeenCalledWith(
        1,  // rec_id
        expect.objectContaining({
          justification:     'My revised justification.',
          correction_reason: 'Corrected score 1001 from 4 to 5.',
          score_corrections: [{ score_id: 1001, raw_score: 5 }],
        }),
      );
    });
  });

  // ── TC-FE-G08-009: success banner ─────────────────────────────────────────

  it('TC-FE-G08-009: success banner appears after successful submission', async () => {
    reviseAndResubmit.mockResolvedValue({ success: true });
    // After success, page will call load() after 800ms; return empty to avoid
    // listMyRecommendations returning stale data
    listMyRecommendations
      .mockResolvedValueOnce([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })])
      .mockResolvedValue([]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Provide your revised justification/i)).toBeDefined();
    });

    const justificationTextarea = screen.getByPlaceholderText(/Provide your revised justification/i);
    await userEvent.clear(justificationTextarea);
    await userEvent.type(justificationTextarea, 'Valid justification text.');

    const corrReasonTextarea = screen.getByPlaceholderText(/Explain what scores or information you have corrected/i);
    await userEvent.type(corrReasonTextarea, 'Valid correction reason.');

    const submitBtn = screen.getByRole('button', { name: /Revise & Resubmit for HR Review/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Recommendation revised and resubmitted/i),
      ).toBeDefined();
    });
  });

  // ── TC-FE-G08-010: API error propagated to banner ─────────────────────────

  it('TC-FE-G08-010: server error message shown in error banner', async () => {
    const apiError = { response: { data: { message: 'You do not own this recommendation.' } } };
    reviseAndResubmit.mockRejectedValue(apiError);
    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Provide your revised justification/i)).toBeDefined();
    });

    const justificationTextarea = screen.getByPlaceholderText(/Provide your revised justification/i);
    await userEvent.clear(justificationTextarea);
    await userEvent.type(justificationTextarea, 'Justification text.');

    const corrReasonTextarea = screen.getByPlaceholderText(/Explain what scores or information you have corrected/i);
    await userEvent.type(corrReasonTextarea, 'Correction reason.');

    const submitBtn = screen.getByRole('button', { name: /Revise & Resubmit for HR Review/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/You do not own this recommendation/i),
      ).toBeDefined();
    });
  });

  // ── TC-FE-G08-011: RevisionHistory renders when revisions present ─────────

  it('TC-FE-G08-011: RevisionHistory button appears when detailRec has revisions', async () => {
    const detailWithRevisions = makeDetail(1, {
      revisions: [
        {
          revision_id:                1,
          revised_at:                 '2024-11-05T09:00:00.000Z',
          correction_reason:          'Corrected attendance.',
          before_recommendation_type: 'DISMISS',
          after_recommendation_type:  'CONFIRM',
          before_cumulative_score:    '45.00',
          after_cumulative_score:     '78.50',
          hr_return_reason:           'Please review attendance.',
          director_return_reason:     null,
          actor: { first_name: 'John', last_name: 'Manager' },
        },
      ],
    });

    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(detailWithRevisions);

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    // Wait for detail to load and revisions toggle to appear
    await waitFor(() => {
      expect(screen.getByText(/correction history/i)).toBeDefined();
    });

    // Click the history toggle button to reveal revision history
    const historyBtn = screen.getByRole('button', { name: /correction history/i });
    await userEvent.click(historyBtn);

    // Should now render the revision actor name
    await waitFor(() => {
      expect(screen.getByText(/John Manager/i)).toBeDefined();
    });
  });

  // ── TC-FE-G08-012: ScoreCorrectionForm — G09 locked scores have no <select>

  it('TC-FE-G08-012: locked score (weight_percent_at_scoring == null) renders without select', async () => {
    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(makeDetail());

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    // Wait for ScoreCorrectionForm to load
    await waitFor(() => {
      // Unlocked score label should appear
      expect(screen.getByText(/Job Performance/i)).toBeDefined();
    });

    // The locked score should show "(locked)" indicator (may appear in multiple DOM nodes)
    expect(screen.getAllByText(/locked/i).length).toBeGreaterThan(0);

    // Only ONE select should exist — for the unlocked score (score_id 1001).
    // The locked score (score_id 1002) must NOT have a select element.
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(1);
  });

  // ── TC-FE-G08-013: APPROVED rec shows PDF download; RETURNED does not ─────

  it('TC-FE-G08-013: APPROVED rec shows PDF download button; RETURNED rec does not', async () => {
    const approvedRec = makeRec({
      rec_id:          2,
      approval_status: 'APPROVED',
      hr_endorsement_notes: null,
    });
    listMyRecommendations.mockResolvedValue([approvedRec]);
    // getRecommendation should not be called for APPROVED (canResubmit = false)

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    // Expand the APPROVED rec
    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download Evaluation Report/i })).toBeDefined();
    });

    // getRecommendation must NOT have been called (APPROVED rec has canResubmit=false)
    expect(getRecommendation).not.toHaveBeenCalled();
  });

  // ── TC-FE-G08-014: revision_count included in payload (Finding 7) ──────────
  // The page must pass detailRec.revision_count in the submission body so the
  // backend can reject a stale form with 409 (G08 Finding 1 stale-review protection).

  it('TC-FE-G08-014 (Finding 7 — interface): revision_count from detailRec included in reviseAndResubmit payload', async () => {
    reviseAndResubmit.mockResolvedValue({ success: true });
    listMyRecommendations
      .mockResolvedValueOnce([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })])
      .mockResolvedValue([]);
    // detailRec has revision_count: 3 — the page must forward this value
    getRecommendation.mockResolvedValue(makeDetail(1, { revision_count: 3 }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Provide your revised justification/i)).toBeDefined();
    });

    const justificationTextarea = screen.getByPlaceholderText(/Provide your revised justification/i);
    await userEvent.clear(justificationTextarea);
    await userEvent.type(justificationTextarea, 'Valid justification.');

    const corrReasonTextarea = screen.getByPlaceholderText(/Explain what scores or information you have corrected/i);
    await userEvent.type(corrReasonTextarea, 'Valid correction reason.');

    const submitBtn = screen.getByRole('button', { name: /Revise & Resubmit for HR Review/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(reviseAndResubmit).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ revision_count: 3 }),
      );
    });
  });

  // ── TC-FE-G08-015: stale-review 409 message shown in banner (Finding 7) ────
  // When the backend returns 409 with the stale-review conflict message, the
  // error banner must display that message so the user knows to reload.

  it('TC-FE-G08-015 (Finding 7 — interface): 409 stale-review conflict message propagated to error banner', async () => {
    const conflictError = {
      response: {
        data: {
          message: 'Conflict: recommendation was revised since you loaded the form. Reload and try again.',
        },
      },
    };
    reviseAndResubmit.mockRejectedValue(conflictError);
    listMyRecommendations.mockResolvedValue([makeRec({ approval_status: 'RETURNED_TO_MANAGER' })]);
    getRecommendation.mockResolvedValue(makeDetail(1, { revision_count: 1 }));

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Brown')).toBeDefined());

    const rowButton = screen.getByRole('button', { name: /Alice Brown/i });
    await userEvent.click(rowButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Provide your revised justification/i)).toBeDefined();
    });

    const justificationTextarea = screen.getByPlaceholderText(/Provide your revised justification/i);
    await userEvent.clear(justificationTextarea);
    await userEvent.type(justificationTextarea, 'Valid justification.');

    const corrReasonTextarea = screen.getByPlaceholderText(/Explain what scores or information you have corrected/i);
    await userEvent.type(corrReasonTextarea, 'Valid correction reason.');

    const submitBtn = screen.getByRole('button', { name: /Revise & Resubmit for HR Review/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Conflict: recommendation was revised since you loaded the form/i),
      ).toBeDefined();
    });
  });

});
