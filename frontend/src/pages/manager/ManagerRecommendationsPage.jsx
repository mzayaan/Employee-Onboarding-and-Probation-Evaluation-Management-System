// =============================================================================
// src/pages/manager/ManagerRecommendationsPage.jsx
//
// Line Manager — My Submitted Recommendations
//
// Shows all probation recommendations the manager has submitted:
//   • PENDING_HR_REVIEW    — awaiting HR endorsement
//   • RETURNED_TO_MANAGER  — HR returned; manager can resubmit with revised justification
//   • PENDING_DIRECTOR     — HR endorsed; awaiting Director decision
//   • UNDER_REVIEW         — Director reviewing
//   • APPROVED             — Director approved
//
// Route:  /manager/recommendations
// FR-15 | NFR-03 | Objective 3
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  listMyRecommendations,
  resubmitRecommendation,
} from '@/api/directorApi'
import {
  BadgeCheck, Loader2, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, RefreshCw, RotateCcw,
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
  RETURNED_TO_MANAGER:  { label: 'Returned — Action Required', bg: 'bg-amber-50',  text: 'text-amber-700'  },
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

// ── Expandable recommendation row ────────────────────────────────────────────
function RecRow({ rec, onRefresh }) {
  const [open,  setOpen]  = useState(false)
  const [notes, setNotes] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')
  const [ok,    setOk]    = useState(false)

  const emp    = rec.probationPeriod?.employeeProfile
  const period = rec.probationPeriod
  const canResubmit = rec.approval_status === 'RETURNED_TO_MANAGER'

  const handleResubmit = async () => {
    if (!notes.trim()) {
      setErr('Revised justification is required when resubmitting.')
      return
    }
    setBusy(true); setErr(''); setOk(false)
    try {
      await resubmitRecommendation(rec.rec_id, { justification: notes.trim() })
      setOk(true)
      setTimeout(() => { onRefresh() }, 800)
    } catch (e) {
      setErr(e?.response?.data?.message || 'Resubmission failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      {/* Summary row */}
      <div
        className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((v) => !v)}
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
            {' '}Score: <span className="font-semibold text-slate-600">{rec.cumulative_score != null ? Number.parseFloat(rec.cumulative_score).toFixed(1) : '—'}%</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            Submitted {fmtDate(rec.generated_at)}
            {rec.rejection_count > 0 && (
              <span className="ml-2 text-amber-600 font-medium">⚠ Returned {rec.rejection_count}×</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canResubmit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(true) }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Resubmit
            </button>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-slate-100 px-6 py-4 space-y-4">

          {/* Justification */}
          {rec.justification && (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
              <p className="font-semibold mb-1 text-xs text-slate-500 uppercase tracking-wide">Your Justification</p>
              <p>{rec.justification}</p>
            </div>
          )}

          {/* HR feedback (if returned) */}
          {rec.hr_endorsement_notes && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <p className="font-semibold mb-1">HR Feedback:</p>
              <p>{rec.hr_endorsement_notes}</p>
            </div>
          )}

          {/* Director reason (if APPROVED or returned by Director) */}
          {rec.director_reason && (
            <div className="rounded-lg bg-purple-50 px-4 py-3 text-sm text-purple-800 ring-1 ring-purple-200">
              <p className="font-semibold mb-1">Director Decision Notes:</p>
              <p>{rec.director_reason}</p>
            </div>
          )}

          {/* Approval timeline */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-slate-400 mb-0.5">HR Reviewed by</p>
              <p className="font-medium text-slate-700">
                {rec.endorsedByHR
                  ? `${rec.endorsedByHR.first_name} ${rec.endorsedByHR.last_name}`
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-slate-400 mb-0.5">Director</p>
              <p className="font-medium text-slate-700">
                {rec.director
                  ? `${rec.director.first_name} ${rec.director.last_name}`
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-slate-400 mb-0.5">Director Decision</p>
              <p className="font-medium text-slate-700">{fmtDate(rec.director_decision_at)}</p>
            </div>
          </div>

          {/* Success banner */}
          {ok && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700 ring-1 ring-green-200">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Recommendation resubmitted — HR will review shortly.
            </div>
          )}

          {/* Error banner */}
          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {err}
            </div>
          )}

          {/* Resubmit form */}
          {canResubmit && !ok && (
            <div className="rounded-xl bg-amber-50 px-5 py-4 ring-1 ring-amber-200 space-y-3">
              <p className="font-medium text-amber-900 text-sm">
                Revise and resubmit your justification to address HR feedback above.
              </p>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setErr('') }}
                placeholder="Provide your revised justification for this probation recommendation…"
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-amber-700 transition"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  <RotateCcw className="h-4 w-4" /> Resubmit for HR Review
                </button>
                <button
                  type="button"
                  onClick={() => { setNotes(''); setErr('') }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Clear
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
export default function ManagerRecommendationsPage() {
  const [recs,     setRecs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)

  const load = useCallback(() => {
    setLoading(true); setLoadErr(null)
    listMyRecommendations()
      .then((data) => setRecs(Array.isArray(data) ? data : []))
      .catch(() => setLoadErr('Failed to load your recommendations.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const actionRequired = recs.filter((r) => r.approval_status === 'RETURNED_TO_MANAGER').length
  const pending = recs.filter((r) => ['PENDING_HR_REVIEW', 'PENDING_DIRECTOR', 'UNDER_REVIEW'].includes(r.approval_status))
  const returned = recs.filter((r) => r.approval_status === 'RETURNED_TO_MANAGER')
  const approved = recs.filter((r) => r.approval_status === 'APPROVED')

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: '#e8f0fb' }}
          >
            <BadgeCheck className="h-5 w-5" style={{ color: '#1e3a5f' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
              My Recommendations
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Track the status of probation recommendations you have submitted.
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
      ) : recs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 px-8 py-16 text-center">
          <BadgeCheck className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No recommendations submitted yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Submit a probation recommendation from the Evaluations page once evaluation checkpoints are complete.
          </p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Action required (returned) ──────────────────────────────── */}
          {returned.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800 flex items-center gap-2">
                Action Required
                <span className="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-medium text-white">
                  {actionRequired}
                </span>
              </h2>
              <div className="space-y-3">
                {returned.map((r) => <RecRow key={r.rec_id} rec={r} onRefresh={load} />)}
              </div>
            </section>
          )}

          {/* ── In progress ─────────────────────────────────────────────── */}
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800">In Progress</h2>
              <div className="space-y-3">
                {pending.map((r) => <RecRow key={r.rec_id} rec={r} onRefresh={load} />)}
              </div>
            </section>
          )}

          {/* ── Approved ────────────────────────────────────────────────── */}
          {approved.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-800">Approved</h2>
              <div className="space-y-3">
                {approved.map((r) => <RecRow key={r.rec_id} rec={r} onRefresh={load} />)}
              </div>
            </section>
          )}

        </div>
      )}
    </AppShell>
  )
}
