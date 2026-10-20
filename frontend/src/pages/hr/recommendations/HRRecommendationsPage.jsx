// =============================================================================
// src/pages/hr/recommendations/HRRecommendationsPage.jsx
//
// HR Administrator — Probation Recommendation Review Queue
//
// Shows all recommendations in PENDING_HR_REVIEW or RETURNED_TO_MANAGER
// status. HR can:
//   • Endorse a recommendation → forwards it to the Director (PENDING_DIRECTOR)
//   • Return a recommendation to the manager with written feedback (RETURNED_TO_MANAGER)
//
// Also shows a secondary table of all recommendations for HR's overall visibility.
//
// Route:  /hr/recommendations
// FR-15, FR-16 | NFR-02, NFR-03 | Objective 3
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  listPendingHR,
  listAllRecommendations,
  endorseRecommendation,
  returnToManagerByHR,
} from '@/api/directorApi'
import {
  ClipboardCheck, Loader2, AlertCircle, CheckCircle2,
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

const STATUS_LABELS = {
  PENDING_HR_REVIEW:    { label: 'Awaiting HR Review',  bg: 'bg-blue-50',   text: 'text-blue-700'   },
  RETURNED_TO_MANAGER:  { label: 'Returned to Manager', bg: 'bg-amber-50',  text: 'text-amber-700'  },
  PENDING_DIRECTOR:     { label: 'Awaiting Director',   bg: 'bg-purple-50', text: 'text-purple-700' },
  UNDER_REVIEW:         { label: 'Under Review',        bg: 'bg-sky-50',    text: 'text-sky-700'    },
  APPROVED:             { label: 'Approved',            bg: 'bg-green-50',  text: 'text-green-700'  },
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || { label: status, bg: 'bg-slate-50', text: 'text-slate-600' }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function RecBadge({ type }) {
  const c = REC_COLOURS[type] || { bg: 'bg-slate-50', text: 'text-slate-600', ring: 'ring-slate-200', label: type }
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.bg} ${c.text} ${c.ring}`}>
      {c.label}
    </span>
  )
}

// ── Expandable action row ─────────────────────────────────────────────────────
function PendingRow({ rec, onRefresh }) {
  const [open,   setOpen]   = useState(false)
  const [mode,   setMode]   = useState(null)   // 'endorse' | 'return'
  const [notes,  setNotes]  = useState('')
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState('')
  const [ok,     setOk]     = useState(false)

  const emp = rec.employeeProfile
  const period = rec.probationPeriod

  const submit = async () => {
    if (mode === 'return' && !notes.trim()) {
      setErr('Feedback notes are required when returning to manager.')
      return
    }
    setBusy(true); setErr(''); setOk(false)
    try {
      if (mode === 'endorse') {
        await endorseRecommendation(rec.rec_id, { hr_endorsement_notes: notes.trim() || undefined })
      } else {
        await returnToManagerByHR(rec.rec_id, { hr_endorsement_notes: notes.trim() })
      }
      setOk(true)
      setTimeout(() => { onRefresh() }, 800)
    } catch (e) {
      setErr(e?.response?.data?.message || 'Action failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const openMode = (m) => { setMode(m); setOpen(true); setNotes(''); setErr(''); setOk(false) }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      {/* Summary row */}
      <div
        className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 truncate">
              {emp?.user?.first_name} {emp?.user?.last_name}
            </span>
            <RecBadge type={rec.recommendation_type} />
            <StatusBadge status={rec.approval_status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {emp?.job_title || '—'} · {emp?.department?.name || 'No dept'} ·
            {' '}Probation ends {fmtDate(period?.end_date)} ·
            {' '}Score: <span className="font-semibold text-slate-600">{rec.cumulative_score?.toFixed(1) ?? '—'}%</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Submitted by {rec.submittedByManager?.first_name} {rec.submittedByManager?.last_name}
            {' '}· {fmtDate(rec.generated_at)}
            {rec.rejection_count > 0 && (
              <span className="ml-2 text-amber-600 font-medium">⚠ Returned {rec.rejection_count}×</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rec.approval_status === 'PENDING_HR_REVIEW' && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openMode('endorse') }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Endorse
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openMode('return') }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Return
              </button>
            </>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded details + action panel */}
      {open && (
        <div className="border-t border-slate-100 px-6 py-4 space-y-4">

          {/* Scores grid */}
          {rec.evaluationScores && rec.evaluationScores.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Evaluation Scores</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {rec.evaluationScores.map((s) => (
                  <div key={s.score_id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500 truncate">
                      {s.criterion?.name || `Criterion ${s.criterion_id}`}
                    </p>
                    <p className="text-base font-bold text-slate-700">{s.weighted_score?.toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Previous HR endorsement notes (if any) */}
          {rec.hr_endorsement_notes && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <p className="font-semibold mb-1">Previous HR Notes:</p>
              <p>{rec.hr_endorsement_notes}</p>
            </div>
          )}

          {/* Success banner */}
          {ok && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700 ring-1 ring-green-200">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {mode === 'endorse' ? 'Recommendation endorsed — forwarded to Director.' : 'Recommendation returned to manager.'}
            </div>
          )}

          {/* Error banner */}
          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {err}
            </div>
          )}

          {/* Action form — only for PENDING_HR_REVIEW */}
          {rec.approval_status === 'PENDING_HR_REVIEW' && mode && !ok && (
            <div className="rounded-xl bg-slate-50 px-5 py-4 ring-1 ring-slate-200 space-y-3">
              <p className="font-medium text-slate-800">
                {mode === 'endorse'
                  ? 'Endorse recommendation (optional notes for Director)'
                  : 'Return to manager — feedback notes required'}
              </p>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setErr('') }}
                placeholder={
                  mode === 'endorse'
                    ? 'Optional: add HR endorsement notes for the Director…'
                    : 'Required: explain to the manager what needs to be corrected…'
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition hover:opacity-90 ${
                    mode === 'endorse' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'endorse' ? 'Confirm Endorsement' : 'Return to Manager'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode(null); setNotes(''); setErr('') }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
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

// ── All-recommendations mini-table ────────────────────────────────────────────
function AllRecommendationsTable({ recs }) {
  if (!recs.length) return null
  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="font-semibold text-slate-800">All Recommendations</h3>
        <p className="mt-0.5 text-xs text-slate-400">Full history — all stages</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-5 py-3 text-left">Employee</th>
            <th className="px-5 py-3 text-left">Recommendation</th>
            <th className="px-5 py-3 text-left">Score</th>
            <th className="px-5 py-3 text-left">Status</th>
            <th className="px-5 py-3 text-left">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {recs.map((r) => {
            const emp = r.employeeProfile
            return (
              <tr key={r.rec_id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-3 font-medium text-slate-700">
                  {emp?.user?.first_name} {emp?.user?.last_name}
                  <span className="ml-2 text-xs font-normal text-slate-400">{emp?.job_title}</span>
                </td>
                <td className="px-5 py-3"><RecBadge type={r.recommendation_type} /></td>
                <td className="px-5 py-3 font-semibold text-slate-700">
                  {r.cumulative_score?.toFixed(1) ?? '—'}%
                </td>
                <td className="px-5 py-3"><StatusBadge status={r.approval_status} /></td>
                <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{fmtDate(r.generated_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HRRecommendationsPage() {
  const [pending,  setPending]  = useState([])
  const [allRecs,  setAllRecs]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr(null)
    Promise.all([listPendingHR(), listAllRecommendations()])
      .then(([p, a]) => {
        setPending(Array.isArray(p) ? p : [])
        setAllRecs(Array.isArray(a) ? a : [])
      })
      .catch(() => setLoadErr('Failed to load recommendations.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const pendingCount = pending.filter((r) => r.approval_status === 'PENDING_HR_REVIEW').length

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: '#e8f0fb' }}
          >
            <ClipboardCheck className="h-5 w-5" style={{ color: '#1e3a5f' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
              Recommendation Review
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Endorse or return probation recommendations before they reach the Director.
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
      ) : (
        <div className="space-y-8">

          {/* ── Pending HR Review queue ─────────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-800">
              Awaiting Your Review
              {pendingCount > 0 && (
                <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                  {pendingCount}
                </span>
              )}
            </h2>

            {pending.filter((r) => r.approval_status === 'PENDING_HR_REVIEW').length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 px-8 py-12 text-center">
                <ClipboardCheck className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                <p className="text-sm text-slate-400">No recommendations awaiting HR review.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending
                  .filter((r) => r.approval_status === 'PENDING_HR_REVIEW')
                  .map((r) => <PendingRow key={r.rec_id} rec={r} onRefresh={load} />)}
              </div>
            )}
          </section>

          {/* ── Returned to manager (waiting on resubmission) ───────────── */}
          {pending.filter((r) => r.approval_status === 'RETURNED_TO_MANAGER').length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800">Returned to Manager</h2>
              <div className="space-y-3">
                {pending
                  .filter((r) => r.approval_status === 'RETURNED_TO_MANAGER')
                  .map((r) => <PendingRow key={r.rec_id} rec={r} onRefresh={load} />)}
              </div>
            </section>
          )}

          {/* ── All recommendations history ─────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-800">All Recommendations</h2>
            <AllRecommendationsTable recs={allRecs} />
          </section>

        </div>
      )}
    </AppShell>
  )
}
