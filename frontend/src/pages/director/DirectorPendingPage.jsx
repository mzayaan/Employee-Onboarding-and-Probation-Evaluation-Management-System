// =============================================================================
// src/pages/director/DirectorPendingPage.jsx
//
// Director — Pending Approvals Queue
//
// Shows recommendations in PENDING_DIRECTOR status.
// Director can:
//   • Approve a recommendation → APPROVED; ProbationPeriod status updated
//   • Return it to the manager with a written reason → RETURNED_TO_MANAGER
//
// Route:  /director/pending
// FR-15 | NFR-02, NFR-03 | Objective 3
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  listPendingDirector,
  approveRecommendation,
  returnByDirector,
} from '@/api/directorApi'
import {
  ShieldCheck, Loader2, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, RefreshCw,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const REC_COLOURS = {
  CONFIRM:  { bg: 'bg-green-50',  text: 'text-green-700',  ring: 'ring-green-200',  label: 'Confirm Employment'  },
  EXTEND:   { bg: 'bg-amber-50',  text: 'text-amber-700',  ring: 'ring-amber-200',  label: 'Extend Probation'    },
  DISMISS:  { bg: 'bg-red-50',    text: 'text-red-700',    ring: 'ring-red-200',    label: 'Recommend Dismissal' },
}

function RecBadge({ type }) {
  const c = REC_COLOURS[type] || { bg: 'bg-slate-50', text: 'text-slate-600', ring: 'ring-slate-200', label: type }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}>
      {c.label}
    </span>
  )
}

// ── Individual pending recommendation card ────────────────────────────────────
function PendingCard({ rec, onRefresh }) {
  const [open,   setOpen]   = useState(false)
  const [mode,   setMode]   = useState(null)    // 'approve' | 'return'
  const [reason, setReason] = useState('')
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState('')
  const [ok,     setOk]     = useState(false)

  const emp    = rec.employeeProfile
  const period = rec.probationPeriod

  const submit = async () => {
    if (mode === 'return' && !reason.trim()) {
      setErr('A reason is required when returning to the manager.')
      return
    }
    setBusy(true); setErr(''); setOk(false)
    try {
      if (mode === 'approve') {
        await approveRecommendation(rec.rec_id, { director_reason: reason.trim() || undefined })
      } else {
        await returnByDirector(rec.rec_id, { director_reason: reason.trim() })
      }
      setOk(true)
      setTimeout(() => { onRefresh() }, 800)
    } catch (e) {
      setErr(e?.response?.data?.message || 'Action failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const openMode = (m) => { setMode(m); setOpen(true); setReason(''); setErr(''); setOk(false) }

  const scoreColour = (score) => {
    if (score >= 75) return 'text-green-600'
    if (score >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      {/* Summary header */}
      <div
        className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-base font-semibold text-slate-800 truncate">
              {emp?.user?.first_name} {emp?.user?.last_name}
            </span>
            <RecBadge type={rec.recommendation_type} />
          </div>
          <p className="text-sm text-slate-500">
            {emp?.job_title || '—'}
            {emp?.department?.name ? ` · ${emp.department.name}` : ''}
            {' '}· Probation ends{' '}
            <span className="font-medium text-slate-700">{fmtDate(period?.end_date)}</span>
          </p>
          <p className="mt-1 text-sm">
            Cumulative score:{' '}
            <span className={`text-lg font-bold ${scoreColour(rec.cumulative_score)}`}>
              {rec.cumulative_score?.toFixed(1) ?? '—'}%
            </span>
            {rec.rejection_count > 0 && (
              <span className="ml-3 text-xs text-amber-600 font-medium">
                ⚠ Returned {rec.rejection_count}× previously
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Submitted by{' '}
            {rec.submittedByManager?.first_name} {rec.submittedByManager?.last_name}
            {' '}· {fmtDate(rec.generated_at)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openMode('approve') }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <ThumbsUp className="h-4 w-4" /> Approve
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openMode('return') }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
          >
            <ThumbsDown className="h-4 w-4" /> Return
          </button>
          {open
            ? <ChevronUp className="h-4 w-4 text-slate-400" />
            : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded detail + action form */}
      {open && (
        <div className="border-t border-slate-100 px-6 py-5 space-y-5">

          {/* Evaluation scores */}
          {rec.evaluationScores && rec.evaluationScores.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Evaluation Scores
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {rec.evaluationScores.map((s) => (
                  <div key={s.score_id} className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500 truncate">
                      {s.criterion?.name || `Criterion ${s.criterion_id}`}
                      {s.criterion?.weight_percentage != null && (
                        <span className="ml-1 text-slate-400">({s.criterion.weight_percentage}%)</span>
                      )}
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-700">
                      {s.weighted_score?.toFixed(1)}%
                    </p>
                    {s.checkpoint?.checkpoint_number && (
                      <p className="text-xs text-slate-400">CP {s.checkpoint.checkpoint_number}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HR endorsement notes */}
          {rec.hr_endorsement_notes && (
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800 ring-1 ring-blue-200">
              <p className="font-semibold mb-1">HR Endorsement Notes:</p>
              <p>{rec.hr_endorsement_notes}</p>
            </div>
          )}

          {/* Success banner */}
          {ok && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {mode === 'approve'
                ? 'Recommendation approved. Probation period status has been updated.'
                : 'Recommendation returned to the manager for revision.'}
            </div>
          )}

          {/* Error banner */}
          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {err}
            </div>
          )}

          {/* Decision form */}
          {mode && !ok && (
            <div className="rounded-xl bg-slate-50 px-5 py-5 ring-1 ring-slate-200 space-y-4">
              <div>
                <p className="font-semibold text-slate-800">
                  {mode === 'approve'
                    ? 'Confirm Approval'
                    : 'Return to Manager — reason required'}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {mode === 'approve'
                    ? 'This action is final. The probation period status will be updated immediately.'
                    : 'The manager will be notified and must resubmit through HR for re-endorsement.'}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {mode === 'approve' ? 'Optional director notes' : 'Reason for returning'}
                  {mode === 'return' && <span className="text-red-500 ml-1">*</span>}
                </label>
                <textarea
                  rows={4}
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); setErr('') }}
                  placeholder={
                    mode === 'approve'
                      ? 'Optional: add a note to the permanent record…'
                      : 'Required: explain clearly what needs to be corrected before resubmission…'
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>

              {/* Final confirmation reminder for approve */}
              {mode === 'approve' && (
                <div className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-700 ring-1 ring-amber-200">
                  ⚠ This decision is permanent. Once approved, the recommendation cannot be reversed through the system.
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 transition hover:opacity-90 ${
                    mode === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'approve' ? 'Confirm Approval' : 'Return to Manager'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode(null); setReason(''); setErr('') }}
                  className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DirectorPendingPage() {
  const [pending,  setPending]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr(null)
    listPendingDirector()
      .then((data) => setPending(Array.isArray(data) ? data : []))
      .catch(() => setLoadErr('Failed to load pending recommendations.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: '#ede9fe' }}
          >
            <ShieldCheck className="h-5 w-5" style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
              Pending Approvals
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Probation recommendations endorsed by HR and awaiting your final decision.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : loadErr ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-6 py-4 text-sm text-red-600 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {loadErr}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 px-8 py-16 text-center">
          <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-slate-300" />
          <p className="text-base font-medium text-slate-500">
            No recommendations awaiting your approval.
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Recommendations will appear here once HR has endorsed them.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {pending.length} recommendation{pending.length !== 1 ? 's' : ''} awaiting your decision
          </p>
          {pending.map((r) => (
            <PendingCard key={r.rec_id} rec={r} onRefresh={load} />
          ))}
        </div>
      )}
    </AppShell>
  )
}
