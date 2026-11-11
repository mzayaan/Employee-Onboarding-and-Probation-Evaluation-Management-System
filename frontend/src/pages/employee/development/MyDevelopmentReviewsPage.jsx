// =============================================================================
// src/pages/employee/development/MyDevelopmentReviewsPage.jsx
// Employee view: read own development reviews and acknowledge them.
// FR-12 | NFR-03 | Objective 2 | NEW_EMPLOYEE
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getMyDevelopmentReviews, acknowledgeReview } from '@/api/developmentReviewApi'
import {
  Heart, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Returns today as YYYY-MM-DD (used to auto-set acknowledgement date)
const todayISO = () => new Date().toISOString().slice(0, 10)

const BALANCE_COLOUR = {
  'Well Balanced':        { bg: '#dcfce7', text: '#166534' },
  'Mostly Balanced':      { bg: '#d1fae5', text: '#065f46' },
  'Somewhat Unbalanced':  { bg: '#fef9c3', text: '#854d0e' },
  'Very Unbalanced':      { bg: '#fee2e2', text: '#991b1b' },
}

function BalanceBadge({ value }) {
  if (!value) return <span className="text-sm text-slate-400">—</span>
  const c = BALANCE_COLOUR[value] || { bg: '#f1f5f9', text: '#475569' }
  return (
    <span
      className="inline-block rounded-full px-3 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {value}
    </span>
  )
}

function Field({ label, value }) {
  if (!value) return null
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

// ── Single review card ────────────────────────────────────────────────────────
function ReviewCard({ review, onAcknowledge }) {
  const [expanded, setExpanded] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)

  const reviewer = review.reviewer
    ? `${review.reviewer.first_name} ${review.reviewer.last_name}`
    : 'Unknown'

  const handleAcknowledge = async () => {
    setSaving(true)
    setError(null)
    try {
      // Date is always set to today automatically — no manual picker
      await onAcknowledge(review.review_id, todayISO())
    } catch {
      setError('Failed to acknowledge. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      {/* Card header */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3 text-left">
          <Heart className="h-4 w-4 flex-shrink-0 text-rose-400" />
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Development Review — {fmtDate(review.created_at)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Conducted by {reviewer}
              {review.checkpoint ? ` · ${review.checkpoint.checkpoint_label}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <BalanceBadge value={review.work_life_balance_rating} />
          {review.employee_acknowledgement ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Acknowledged
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              Pending acknowledgement
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
            <div>
              <Field label="Workload assessment"            value={review.workload_assessment} />
              <Field label="Professional balance"           value={review.professional_balance_notes} />
              <Field label="Professional development goals" value={review.professional_development_goals} />
            </div>
            <div>
              <Field label="Actions to balance work / life" value={review.actions_to_balance} />
              <Field label="Support offered"                value={review.support_offered} />
              {review.next_review_date && (
                <div className="mb-3 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-xs text-slate-500">
                    Next review: <span className="font-medium text-slate-700">{fmtDate(review.next_review_date)}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Acknowledgement section */}
          <div className="mt-4 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
            {review.employee_acknowledgement ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                You acknowledged this review on{' '}
                <strong className="ml-1">{fmtDate(review.employee_acknowledgement_date)}</strong>
              </div>
            ) : (
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">
                  Please acknowledge that you have read and discussed this review with your manager.
                </p>
                <p className="mb-3 text-xs text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Acknowledgement date will be set to today automatically:{' '}
                  <span className="font-medium text-slate-600">{fmtDate(todayISO())}</span>
                </p>
                <button
                  onClick={handleAcknowledge}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Acknowledge Review'}
                </button>
                {error && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" /> {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyDevelopmentReviewsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getMyDevelopmentReviews()
      .then(setReviews)
      .catch(() => setError('Failed to load your development reviews.'))
      .finally(() => setLoading(false))
  }, [])

  const handleAcknowledge = async (reviewId, date) => {
    const { acknowledgeReview: ack } = await import('@/api/developmentReviewApi')
    const updated = await ack(reviewId, date)
    setReviews((prev) => prev.map((r) => (r.review_id === reviewId ? updated : r)))
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          My Development Reviews
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Reviews conducted by your manager or HR — read each one and confirm you have discussed it.
        </p>
      </div>

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && reviews.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <Heart className="mb-3 h-8 w-8 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No development reviews yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Your manager will schedule a review as part of your probation process.
          </p>
        </div>
      )}

      {!loading && !error && reviews.length > 0 && (
        <>
          {/* Summary banner */}
          <div className="mb-5 flex items-center gap-4 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-800">{reviews.length}</p>
              <p className="text-xs text-slate-400">Total</p>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <p className="text-lg font-bold text-green-700">
                {reviews.filter((r) => r.employee_acknowledgement).length}
              </p>
              <p className="text-xs text-slate-400">Acknowledged</p>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <p className="text-lg font-bold text-amber-600">
                {reviews.filter((r) => !r.employee_acknowledgement).length}
              </p>
              <p className="text-xs text-slate-400">Pending</p>
            </div>
          </div>

          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard
                key={r.review_id}
                review={r}
                onAcknowledge={handleAcknowledge}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  )
}
