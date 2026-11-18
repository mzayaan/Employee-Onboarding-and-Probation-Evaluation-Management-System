// =============================================================================
// src/tests/SelfAssessmentPage.weightHistory.test.jsx
//
// Component tests for the weight-history warning behaviour in SelfAssessmentPage.
//
// Covered behaviours (G09-FIX Fix 6):
//   1. When the API returns hasUnresolvableWeightHistory: true, the warning
//      banner is rendered and the Submit Self-Assessment button is disabled.
//   2. When the API returns hasUnresolvableWeightHistory: false, the warning
//      banner is absent.
//   3. When the user switches to a different checkpoint, the stale warning is
//      cleared synchronously (before the new fetch resolves).
//
// FR-14 | G09-EDGE | Objective 2
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SelfAssessmentPage from '../pages/employee/assessments/SelfAssessmentPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/components/shared/AppShell', () => ({
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock('@/api/evaluationApi', () => ({
  getMyProbation:       vi.fn(),
  getCheckpoint:        vi.fn(),
  submitSelfAssessment: vi.fn(),
}));

import { getMyProbation, getCheckpoint } from '@/api/evaluationApi';

// ── Minimal data factories ─────────────────────────────────────────────────────

function makeProbation(checkpointIds = [1, 2]) {
  return {
    probation_period_id: 1,
    status:              'ACTIVE',
    checkpoints: checkpointIds.map((id, i) => ({
      checkpoint_id:    id,
      checkpoint_label: `Day ${(i + 1) * 30}`,
      status:           'PENDING',
      selfAssessment:   null,   // not yet submitted → appears in selector
    })),
  };
}

function makeCheckpointResponse(hasUnresolvableWeightHistory, checkpointId = 1) {
  return {
    success: true,
    data: {
      checkpoint_id: checkpointId,
      status:        'PENDING',
      due_date:      '2024-01-01',   // past date — not "not yet due"
      selfAssessment:    null,
      managerEvaluation: null,
      probationPeriod: { status: 'ACTIVE' },
    },
    criteria:                     [],
    hasUnresolvableWeightHistory,
  };
}

// ── Render helper (SelfAssessmentPage needs a Router for useNavigate) ─────────

function renderPage() {
  return render(
    <MemoryRouter>
      <SelfAssessmentPage />
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SelfAssessmentPage — weight-history warning (TC-G09-FE-SA)', () => {

  // ── TC-G09-FE-SA-01 ───────────────────────────────────────────────────────
  // When the API reports unresolvable weight history, the warning banner must
  // be rendered after the checkpoint loads.
  it('TC-G09-FE-SA-01: warning banner rendered when hasUnresolvableWeightHistory is true', async () => {
    getMyProbation.mockResolvedValue(makeProbation([1]));
    getCheckpoint.mockResolvedValue(makeCheckpointResponse(true, 1));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Weight history unavailable — submission blocked'))
        .toBeInTheDocument();
    });
  });

  // ── TC-G09-FE-SA-02 ───────────────────────────────────────────────────────
  // When the API reports no unresolvable weight history, the warning banner
  // must NOT be present.
  it('TC-G09-FE-SA-02: warning banner absent when hasUnresolvableWeightHistory is false', async () => {
    getMyProbation.mockResolvedValue(makeProbation([1]));
    getCheckpoint.mockResolvedValue(makeCheckpointResponse(false, 1));

    renderPage();

    await waitFor(() => {
      expect(screen.queryByText('Weight history unavailable — submission blocked'))
        .not.toBeInTheDocument();
    });
  });

  // ── TC-G09-FE-SA-03 ───────────────────────────────────────────────────────
  // When the warning is active, the Submit Self-Assessment button must be
  // disabled so the employee cannot trigger a backend 422 rejection.
  it('TC-G09-FE-SA-03: Submit Self-Assessment button is disabled when warning is active', async () => {
    getMyProbation.mockResolvedValue(makeProbation([1]));
    getCheckpoint.mockResolvedValue(makeCheckpointResponse(true, 1));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Weight history unavailable — submission blocked'))
        .toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /submit self-assessment/i });
    expect(submitBtn).toBeDisabled();
  });

  // ── TC-G09-FE-SA-04 ───────────────────────────────────────────────────────
  // When the user clicks to switch to a different checkpoint, the stale warning
  // from the previous checkpoint must be cleared synchronously (before the new
  // getCheckpoint fetch resolves) so it does not persist on the new view.
  //
  // Test approach:
  //   1. Probation has two checkpoints (cp1, cp2).
  //   2. cp1 auto-selected on mount; getCheckpoint(1) returns warning=true.
  //   3. User clicks the cp2 selector button; getCheckpoint(2) is deferred.
  //   4. The synchronous setWeightHistoryWarning(null) fires immediately in the
  //      useEffect, clearing the warning before the deferred promise resolves.
  //   5. Resolve cp2 with warning=false; warning remains absent.
  it('TC-G09-FE-SA-04: warning cleared synchronously when switching checkpoints', async () => {
    // Both cp1 and cp2 are in the probation so the selector renders both buttons.
    getMyProbation.mockResolvedValue(makeProbation([1, 2]));

    // cp1: warning present.
    getCheckpoint.mockResolvedValueOnce(makeCheckpointResponse(true, 1));

    // cp2: deferred so we can observe the synchronous clear before resolution.
    let resolveSecondFetch;
    const deferredFetch = new Promise((resolve) => { resolveSecondFetch = resolve; });
    getCheckpoint.mockReturnValueOnce(deferredFetch);

    renderPage();

    // Wait for cp1 warning to appear.
    await waitFor(() => {
      expect(screen.getByText('Weight history unavailable — submission blocked'))
        .toBeInTheDocument();
    });

    // Click the "Day 60" checkpoint selector button to switch to cp2.
    const cp2Button = screen.getByRole('button', { name: 'Day 60' });
    await userEvent.click(cp2Button);

    // The synchronous setWeightHistoryWarning(null) fires immediately in the
    // useEffect on selectedCheckpoint change, so warning must be gone even
    // while the deferred fetch is still pending.
    await waitFor(() => {
      expect(screen.queryByText('Weight history unavailable — submission blocked'))
        .not.toBeInTheDocument();
    });

    // Resolve cp2 with no warning — confirm warning stays absent.
    act(() => { resolveSecondFetch(makeCheckpointResponse(false, 2)); });

    await waitFor(() => {
      expect(screen.queryByText('Weight history unavailable — submission blocked'))
        .not.toBeInTheDocument();
    });
  });

});
