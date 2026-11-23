// =============================================================================
// src/pages/manager/ManagerRecommendationsPage.jsx
//
// Line Manager — My Submitted Recommendations
//
// Shows all probation recommendations the manager has submitted.
// When a recommendation is RETURNED_TO_MANAGER the manager sees:
//   • HR and/or Director return reasons (Req 8)
//   • Eligible checkpoint scores, pre-filled, editable 1–5 (Req 8, Req 3)
//   • Mandatory correction_reason textarea (Req 8)
//   • Mandatory justification textarea (pre-filled) (Req 8)
//   • Revise-and-Resubmit action via POST /revise-and-resubmit (Req 8)
//   • Revision history (Req 5, Req 8)
//
// Route:  /manager/recommendations
// FR-15 | NFR-03 | Objective 3
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  listMyRecommendations,
  getRecommendation,
  reviseAndResubmit,
} from '@/api/directorApi'
import { downloadReport } from '@/api/reportApi'
import {
  BadgeCheck, Loader2, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, RefreshCw, RotateCcw, FileDown,
  History, Info,
} from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—'

const REC_COLOURS = {
  CONFIRM:  { bg: 'bg-green-50',  text: 'text-green-700',  ring: 'ring-green-200',  label: 'Confirm Employment'  },
  EXTEND:   { bg: 'bg-amber-50',  text: 'text-amber-700',  ring: 'ring-amber-200',  label: 'Extend Probation'    },
  DISMISS:  { bg: 'bg-red-50',    text: 'text-red-700',    ring: 'ring-red-200',    label: 'Recommend Dismissal' },
}

const STATUS_LABELS = {
  PENDING_HR_REVIEW:    { label: 'Awaiting HR Review',         bg: 'bg-blue-50',   text: 'text-blue-700'   },
  RETURNED_TO_MANAGER:  { label: 'Returned — Action Required', bg: 'bg-amber-50',  text: 'text-amber-700'  },
  PENDING_DIRECTOR:     { label: 'Awaiting Director',          bg: 'bg-purple-50', text: 'text-purple-700' },
  UNDER_REVIEW:         { label: 'Under Review',               bg: 'bg-sky-50',    text: 'text-sky-700'    },
  APPROVED:             { label: 'Approved',                   bg: 'bg-green-50',  text: 'text-green-700'  },
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

// ── Revision history panel ───────────────────────────────────────────────────
function RevisionHistory({ revisions }) {
  if (!revisions?.length) return null
  return (
    <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-slate-500" />
        <p className="text-sm font-semibold text-slate-700">Correction History</p>
      </div>
      <div className="space-y-3">
        {revisions.map((rev, idx) => (
          <div key={rev.revision_id ?? idx} className="rounded-lg bg-white ring-1 ring-slate-100 px-4 py-3 text-xs space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700">
                {rev.actor ? `${rev.actor.first_name} ${rev.actor.last_name}` : 'Manager'}
              </span>
              <span className="text-slate-400">{fmtDateTime(rev.revised_at)}</span>
              {(rev.before_recommendation_type !== rev.after_recommendation_type) && (
                <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-medium">
                  {rev.before_recommendation_type} → {rev.after_recommendation_type}
                </span>
              )}
              {rev.before_cumulative_score != null && rev.after_cumulative_score != null &&
               Number.parseFloat(rev.before_cumulative_score) !== Number.parseFloat(rev.after_cumulative_score) && (
                <span className="text-slate-500">
                  Score: {Number.parseFloat(rev.before_cumulative_score).toFixed(1)}%
                  {' → '}
                  {Number.parseFloat(rev.after_cumulative_score).toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-slate-600">
              <span className="font-medium">Reason: </span>{rev.correction_reason}
            </p>
            {rev.hr_return_reason && (
              <p className="text-amber-700">
                <span className="font-medium">HR return reason (at time): </span>{rev.hr_return_reason}
              </p>
            )}
            {rev.director_return_reason && (
              <p className="text-purple-700">
                <span className="font-medium">Director return reason (at time): </span>{rev.director_return_reason}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Score correction form (shown when RETURNED_TO_MANAGER) ───────────────────
// G08 (Finding 7 — protected-control rendering):
//   • Checkpoints with no completed_at cannot be cycle-verified by the backend
//     and will be rejected on submission.  Show them as read-only with a label.
//   • Scores with an unresolved weight (pre-G09 rows) are already locked.
function ScoreCorrectionForm({ detailRec, corrections, onScoreChange }) {
  const checkpoints = detailRec?.probationPeriod?.checkpoints ?? []
  if (!checkpoints.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500 ring-1 ring-slate-200">
        <Info className="h-3.5 w-3.5 flex-shrink-0" />
        No completed checkpoint scores are available for correction.
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        Evaluation Scores by Checkpoint
      </p>
      {checkpoints.map((cp) => {
        const eval_ = cp.managerEvaluation
        const scores = eval_?.scores ?? []
        // G08 (Finding 7): a checkpoint with no completed_at cannot have its
        // cycle membership verified — the backend will reject any correction
        // attempt.  Display the whole checkpoint as read-only.
        const noCompletion = !cp.completed_at
        return (
          <div key={cp.checkpoint_id} className={`rounded-lg bg-white ring-1 overflow-hidden ${noCompletion ? 'ring-slate-100 opacity-60' : 'ring-slate-200'}`}>
            <div className="bg-slate-50 px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Checkpoint {cp.checkpoint_number ?? cp.checkpoint_id}
                {cp.checkpoint_label ? ` — ${cp.checkpoint_label}` : ''}
                {noCompletion && (
                  <span className="ml-2 text-amber-600 font-normal">(incomplete — read-only)</span>
                )}
              </span>
              <span className="text-xs text-slate-400">
                {noCompletion
                  ? <span className="text-amber-500">No completion date</span>
                  : <>Completed {fmtDate(cp.completed_at)}</>}
                {eval_ && (
                  <> · Total: <span className="font-semibold text-slate-600">{Number.parseFloat(eval_.weighted_score ?? 0).toFixed(1)}%</span></>
                )}
              </span>
            </div>
            {scores.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-400">No scores recorded.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {scores.map((score) => {
                  const currentVal = corrections[score.score_id] ?? score.raw_score
                  const isChanged = Number(currentVal) !== Number(score.raw_score)
                  // A score is editable only when: the checkpoint has a completion
                  // date AND the weight is resolved.
                  const isEditable = !noCompletion && score.weight_percent_at_scoring != null
                  return (
                    <div key={score.score_id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">
                          {score.name_at_scoring ?? score.criterion?.name ?? `Criterion ${score.criterion_id}`}
                        </p>
                        <p className="text-xs text-slate-400">
                          Weight: {score.weight_percent_at_scoring != null
                            ? `${Number.parseFloat(score.weight_percent_at_scoring).toFixed(1)}%`
                            : <span className="text-amber-600">unresolved (locked)</span>}
                        </p>
                      </div>
                      {!isEditable ? (
                        // Read-only — either no completion date or unresolved weight
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <span className="font-semibold">{score.raw_score}</span>
                          <span className="text-slate-400">/ 5 (locked)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {isChanged && (
                            <span className="text-xs text-slate-400 line-through">{score.raw_score}</span>
                          )}
                          <select
                            value={currentVal}
                            onChange={(e) => onScoreChange(score.score_id, Number(e.target.value))}
                            className={`rounded border px-2 py-1 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-200 ${
                              isChanged
                                ? 'border-amber-400 bg-amber-50 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-700'
                            }`}
                          >
                            {[1,2,3,4,5].map((v) => (
                              <option key={v} value={v}>{v} / 5</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Expandable recommendation row ────────────────────────────────────────────
function RecRow({ rec, onRefresh }) {
  const [open,          setOpen]          = useState(false)
  const [justification, setJustification] = useState(rec.justification || '')
  const [corrReason,    setCorrReason]    = useState('')
  const [corrections,   setCorrections]   = useState({}) // { score_id: raw_score }
  const [busy,          setBusy]          = useState(false)
  const [err,           setErr]           = useState('')
  const [ok,            setOk]            = useState(false)
  const [pdfBusy,       setPdfBusy]       = useState(false)
  const [pdfErr,        setPdfErr]        = useState('')
  const [showHistory,   setShowHistory]   = useState(false)
  // Lazy-loaded detail (scores + revisions) — fetched once when form is opened
  const [detailRec,     setDetailRec]     = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErr,     setDetailErr]     = useState('')

  const emp    = rec.probationPeriod?.employeeProfile
  const period = rec.probationPeriod
  const canResubmit = rec.approval_status === 'RETURNED_TO_MANAGER'

  // Fetch full detail (scores + revisions) once when the correction form is opened
  useEffect(() => {
    if (!open || !canResubmit || detailRec || detailLoading) return
    setDetailLoading(true); setDetailErr('')
    getRecommendation(rec.rec_id)
      .then((data) => {
        setDetailRec(data)
        // Pre-fill justification from live detail
        if (data.justification) setJustification(data.justification)
      })
      .catch(() => setDetailErr('Could not load score details. You may still revise the justification and resubmit.'))
      .finally(() => setDetailLoading(false))
  }, [open, canResubmit, rec.rec_id, detailRec, detailLoading])

  const handleScoreChange = (scoreId, value) =>
    setCorrections((prev) => ({ ...prev, [scoreId]: value }))

  const handleDownloadPdf = async () => {
    const periodId = rec.probationPeriod?.period_id
    if (!periodId) return
    setPdfBusy(true); setPdfErr('')
    try {
      const blob = await downloadReport(periodId)
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const empName = `${emp?.user?.first_name ?? 'employee'}-${emp?.user?.last_name ?? ''}`.toLowerCase().replace(/\s+/g, '-')
      a.download = `probation-report-${empName}-${periodId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setPdfErr('Report download failed. The report may not have been generated yet.')
    } finally {
      setPdfBusy(false)
    }
  }

  const handleReviseAndResubmit = async () => {
    if (!justification.trim()) {
      setErr('Justification is required.')
      return
    }
    if (!corrReason.trim()) {
      setErr('Correction reason is required — please explain what you are changing and why.')
      return
    }

    // Build score_corrections: only send scores that differ from the original
    const scoreCorrections = Object.entries(corrections)
      .filter(([scoreId, newVal]) => {
        const allScores = detailRec?.probationPeriod?.checkpoints
          ?.flatMap((cp) => cp.managerEvaluation?.scores ?? []) ?? []
        const orig = allScores.find((s) => s.score_id === Number(scoreId))
        return orig && Number(newVal) !== Number(orig.raw_score)
      })
      .map(([scoreId, newVal]) => ({ score_id: Number(scoreId), raw_score: Number(newVal) }))

    setBusy(true); setErr(''); setOk(false)
    try {
      // G08 (Finding 7 — interface completeness): include the optimistic-lock counter
      // so the backend can reject the submission if another revision was saved since
      // this form was loaded (stale-review protection, Finding 1).
      await reviseAndResubmit(rec.rec_id, {
        justification:     justification.trim(),
        correction_reason: corrReason.trim(),
        score_corrections: scoreCorrections,
        revision_count:    detailRec?.revision_count ?? rec.revision_count,
      })
      setOk(true)
      setTimeout(() => { onRefresh() }, 800)
    } catch (e) {
      setErr(e?.response?.data?.message || 'Revision and resubmission failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Collect revision history from either lazy-loaded detail or list data
  const revisions = detailRec?.revisions ?? rec.revisions ?? []

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
              <RotateCcw className="h-3.5 w-3.5" /> Revise &amp; Resubmit
            </button>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="border-t border-slate-100 px-6 py-4 space-y-4">

          {/* HR return reason (Req 8) */}
          {rec.hr_endorsement_notes && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <p className="font-semibold mb-1 text-xs text-amber-600 uppercase tracking-wide">HR Return Reason</p>
              <p>{rec.hr_endorsement_notes}</p>
            </div>
          )}

          {/* Director return reason (Req 8) */}
          {rec.director_reason && (
            <div className="rounded-lg bg-purple-50 px-4 py-3 text-sm text-purple-800 ring-1 ring-purple-200">
              <p className="font-semibold mb-1 text-xs text-purple-600 uppercase tracking-wide">Director Return Reason</p>
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

          {/* Revision history toggle (Req 5, Req 8) */}
          {revisions.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                <History className="h-3.5 w-3.5" />
                {showHistory ? 'Hide' : 'Show'} correction history ({revisions.length})
              </button>
              {showHistory && <div className="mt-2"><RevisionHistory revisions={revisions} /></div>}
            </div>
          )}

          {/* PDF download — available once approved */}
          {rec.approval_status === 'APPROVED' && (
            <div>
              {pdfErr && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-xs text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {pdfErr}
                </div>
              )}
              <button
                type="button"
                disabled={pdfBusy}
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
              >
                {pdfBusy
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <FileDown className="h-4 w-4" />}
                Download Evaluation Report (PDF)
              </button>
            </div>
          )}

          {/* Success banner */}
          {ok && (
            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700 ring-1 ring-green-200">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Recommendation revised and resubmitted — HR will review shortly.
            </div>
          )}

          {/* Error banner — G08 (Finding 7): include reload/retry for 409 conflicts */}
          {err && (
            <div className="rounded-lg bg-red-50 px-4 py-2.5 ring-1 ring-red-200">
              <div className="flex items-start gap-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="flex-1">{err}</span>
              </div>
              {/* Stale-review conflict: prompt the manager to reload the form so the
                  latest revision_count is fetched before retrying. */}
              {(err.includes('revision') || err.includes('concurrent') || err.includes('stale')) && (
                <button
                  type="button"
                  onClick={() => { setDetailRec(null); setErr('') }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-200 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" /> Reload &amp; retry
                </button>
              )}
            </div>
          )}

          {/* Revise-and-resubmit form (Req 8) */}
          {canResubmit && !ok && (
            <div className="rounded-xl bg-amber-50 px-5 py-5 ring-1 ring-amber-200 space-y-4">
              <p className="font-semibold text-amber-900 text-sm">
                Revise your submission to address the return reason above.
              </p>

              {/* Checkpoint score corrections (Req 3, Req 8) */}
              {detailLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading checkpoint scores…
                </div>
              ) : detailErr ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-700">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" /> {detailErr}
                </div>
              ) : detailRec ? (
                <ScoreCorrectionForm
                  detailRec={detailRec}
                  corrections={corrections}
                  onScoreChange={handleScoreChange}
                />
              ) : null}

              {/* Correction reason — required (Req 8) */}
              <div>
                <label className="block text-xs font-semibold text-amber-800 mb-1">
                  Correction Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={corrReason}
                  onChange={(e) => { setCorrReason(e.target.value); setErr('') }}
                  placeholder="Explain what scores or information you have corrected and why…"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
                />
              </div>

              {/* Justification — required (Req 8) */}
              <div>
                <label className="block text-xs font-semibold text-amber-800 mb-1">
                  Revised Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={justification}
                  onChange={(e) => { setJustification(e.target.value); setErr('') }}
                  placeholder="Provide your revised justification for this probation recommendation…"
                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReviseAndResubmit}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-amber-700 transition"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  <RotateCcw className="h-4 w-4" /> Revise &amp; Resubmit for HR Review
                </button>
                <button
                  type="button"
                  onClick={() => { setCorrReason(''); setErr(''); setCorrections({}) }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Reset
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
  const pending  = recs.filter((r) => ['PENDING_HR_REVIEW', 'PENDING_DIRECTOR', 'UNDER_REVIEW'].includes(r.approval_status))
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
              Track and manage the probation recommendations you have submitted.
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
