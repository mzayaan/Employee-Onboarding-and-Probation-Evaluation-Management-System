// =============================================================================
// src/tests/EvaluationFormPage.weightHistory.test.jsx
//
// Component tests for the weight-history warning behaviour in EvaluationFormPage.
//
// Covered behaviours (G09-FIX Fix 6):
//   1. When the API returns hasUnresolvableWeightHistory: true, the warning
//      banner is rendered and the Submit button is disabled.
//   2. When the API returns hasUnresolvableWeightHistory: false, the warning
//      banner is absent and the Submit button is not disabled by the warning.
//   3. When the user switches to a different checkpoint, the warning is cleared
//      synchronously (before the new fetch resolves), so a stale warning from
//      the previous checkpoint does not leak into the new view.
//
// FR-14 | G09-EDGE | Objective 2
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import EvaluationFormPage from '../pages/manager/EvaluationFormPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock AppShell to a passthrough — avoids auth context dependencies.
vi.mock('@/components/shared/AppShell', () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

// Mock evaluationApi — getCheckpoint and submitManagerEvaluation.
vi.mock('@/api/evaluationApi', () => ({
  getCheckpoint:            vi.fn(),
  submitManagerEvaluation:  vi.fn(),
}));

import { getCheckpoint } from '@/api/evaluationApi';

// ── Minimal checkpoint responses ──────────────────────────────────────────────

/**
 * Build a minimal getCheckpoint response.
 * @param {boolean} hasUnresolvableWeightHistory
 * @param {number}  checkpointId
 */
function makeCheckpointResponse(hasUnresolvableWeightHistory, checkpointId = 1) {
  return {
    success: true,
    data: {
      checkpoint_id:  checkpointId,
      status:         'PENDING',
      due_date:       '2024-01-01',   // past date — not "not yet due"
      managerEvaluation: null,
      probationPeriod: {
        status:    'ACTIVE',
        checkpoints: [],
        employeeProfile: {
          user: {
            first_name: 'Test',
            last_name:  'User',
            email:      'test@example.com',
          },
          department:  null,
          job_title:   'Developer',
          probation_end_date: '2025-12-31',
        },
      },
    },
    criteria:                     [],
    hasUnresolvableWeightHistory,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

function makeRouter(initialPath = '/eval/1') {
  return createMemoryRouter(
    [{ path: '/eval/:checkpointId', element: <EvaluationFormPage /> }],
    { initialEntries: [initialPath] }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EvaluationFormPage — weight-history warning (TC-G09-FE-MGR)', () => {

  // ── TC-G09-FE-MGR-01 ──────────────────────────────────────────────────────
  // When the API reports unresolvable weight history, the warning banner must
  // be rendered.  The warning communicates to the manager that submission is
  // blocked until the System Administrator resolves the weight records.
  it('TC-G09-FE-MGR-01: warning banner rendered when hasUnresolvableWeightHistory is true', async () => {
    getCheckpoint.mockResolvedValue(makeCheckpointResponse(true));

    const router = makeRouter('/eval/1');
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Weight history unavailable — submission blocked'))
        .toBeInTheDocument();
    });
  });

  // ── TC-G09-FE-MGR-02 ──────────────────────────────────────────────────────
  // When the API reports no unresolvable weight history, the warning banner
  // must NOT be present.
  it('TC-G09-FE-MGR-02: warning banner absent when hasUnresolvableWeightHistory is false', async () => {
    getCheckpoint.mockResolvedValue(makeCheckpointResponse(false));

    const router = makeRouter('/eval/1');
    render(<RouterProvider router={router} />);

    // Wait for loading to complete (spinner disappears / some content appears).
    await waitFor(() => {
      expect(screen.queryByText('Weight history unavailable — submission blocked'))
        .not.toBeInTheDocument();
    });
  });

  // ── TC-G09-FE-MGR-03 ──────────────────────────────────────────────────────
  // When the warning is active, the Submit Evaluation button must be disabled
  // so the manager cannot trigger a backend 422 UNRESOLVED_WEIGHT_HISTORY
  // rejection.
  it('TC-G09-FE-MGR-03: Submit Evaluation button is disabled when warning is active', async () => {
    getCheckpoint.mockResolvedValue(makeCheckpointResponse(true));

    const router = makeRouter('/eval/1');
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText('Weight history unavailable — submission blocked'))
        .toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /submit evaluation/i });
    expect(submitBtn).toBeDisabled();
  });

  // ── TC-G09-FE-MGR-04 ──────────────────────────────────────────────────────
  // When the user switches to a different checkpoint, the stale warning from
  // the previous checkpoint must be cleared synchronously (before the new
  // fetch resolves) so it does not persist on the new view.
  //
  // Test approach:
  //   1. Load cp=1 → warning appears (hasUnresolvableWeightHistory: true).
  //   2. Navigate to cp=2; cp=2 response is deferred (pending promise).
  //   3. The synchronous setWeightHistoryWarning(null) in the useEffect fires
  //      immediately, clearing the warning before the promise resolves.
  //   4. After resolving cp=2 with warning=false, warning is still absent.
  it('TC-G09-FE-MGR-04: warning cleared synchronously when switching checkpoints', async () => {
    // First fetch (cp=1): warning present.
    getCheckpoint.mockResolvedValueOnce(makeCheckpointResponse(true, 1));

    // Second fetch (cp=2): deferred so we can observe the synchronous clear.
    let resolveSecondFetch;
    const deferredFetch = new Promise((resolve) => { resolveSecondFetch = resolve; });
    getCheckpoint.mockReturnValueOnce(deferredFetch);

    const router = makeRouter('/eval/1');
    render(<RouterProvider router={router} />);

    // Wait for warning to appear from cp=1.
    await waitFor(() => {
      expect(screen.getByText('Weight history unavailable — submission blocked'))
        .toBeInTheDocument();
    });

    // Navigate to cp=2 — triggers re-run of the useEffect with new checkpointId.
    act(() => { router.navigate('/eval/2'); });

    // The synchronous setWeightHistoryWarning(null) fires immediately in the
    // effect, so the warning must be cleared before the deferred promise resolves.
    await waitFor(() => {
      expect(screen.queryByText('Weight history unavailable — submission blocked'))
        .not.toBeInTheDocument();
    });

    // Resolve the deferred fetch with no warning to confirm the final state.
    act(() => { resolveSecondFetch(makeCheckpointResponse(false, 2)); });

    await waitFor(() => {
      expect(screen.queryByText('Weight history unavailable — submission blocked'))
        .not.toBeInTheDocument();
    });
  });

});
