// =============================================================================
// src/pages/manager/EvaluationFormPage.jsx
// Manager Probation Evaluation Form — star ratings per criterion + notes.
// Matches Figma 12:32.
// FR-11, FR-12, FR-14, FR-15 | Objectives 2, 3 | LINE_MANAGER / HR_ADMIN
//
// API response from GET /api/evaluations/checkpoint/:id:
//   { success, data: <EvaluationCheckpoint>, criteria: [...], }
//   The checkpoint includes: .probationPeriod.employeeProfile.user
//                             .probationPeriod.checkpoints[]  (sibling checkpoints)
//                             .managerEvaluation.scores[]
//                             .selfAssessment
// =============================================================================

import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { getCheckpoint, submitManagerEvaluation } from '@/api/evaluationApi'
import {
  Star, Loader2, AlertCircle, CheckCircle2, ChevronLeft,
  ClipboardList, TrendingUp
} from 'lucide-react'

// ── Star rating ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange, disabled = false }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(star)}
          onMouseEnter={() => !disabled && setHovered(star)}
          className={`p-0.5 transition-transform ${!disabled ? 'hover:scale-110 cursor-pointer' : 'cursor-default'}`}
        >
          <Star
            className="h-6 w-6"
            fill={(hovered || value) >= star ? '#f59e0b' : 'none'}
            stroke={(hovered || value) >= star ? '#f59e0b' : '#d1d5db'}
            strokeWidth={1.5}
          />
        </button>
      ))}
      <span className="ml-1.5 text-sm font-medium text-slate-500">
        {value > 0 ? `${value}/5` : '—'}
      </span>
    </div>
  )
}

// ── Score helpers ─────────────────────────────────────────────────────────────
const calcContribution = (raw, weight) => {
  if (!raw || !weight) return 0
  return parseFloat(((raw / 5.0) * parseFloat(weight)).toFixed(2))
}

const deriveRecommendation = (score) => {
  if (score >= 75) return { label: 'Confirm Employment', colour: '#15803d', bg: '#dcfce7' }
  if (score >= 50) return { label: 'Extend Probation',   colour: '#854d0e', bg: '#fef9c3' }
  return             { label: 'Recommend Dismissal',     colour: '#b91c1c', bg: '#fee2e2' }
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Checkpoint history entry ──────────────────────────────────────────────────
function HistoryEntry({ cp, currentId }) {
  const score = cp.managerEvaluation?.weighted_score
  const isCurrent = cp.checkpoint_id === currentId
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${isCurrent ? 'ring-1 ring-blue-300 bg-blue-50' : 'bg-slate-50'}`}>
      <div>
        <p className={`font-medium ${isCurrent ? 'text-blue-700' : 'text-slate-700'}`}>
          {cp.checkpoint_label}
        </p>
        <p className="text-xs text-slate-400">{fmtDate(cp.checkpoint_date)}</p>
      </div>
      {score != null ? (
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{
            backgroundColor: parseFloat(score) >= 75 ? '#dcfce7' : parseFloat(score) >= 50 ? '#fef9c3' : '#fee2e2',
            color:            parseFloat(score) >= 75 ? '#15803d' : parseFloat(score) >= 50 ? '#854d0e' : '#b91c1c',
          }}
        >
          {parseFloat(score).toFixed(1)}
        </span>
      ) : (
        <span className="text-xs text-slate-400">
          {cp.status === 'OVERDUE' ? 'Overdue' : 'Pending'}
        </span>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EvaluationFormPage() {
  const { checkpointId } = useParams()
  const navigate         = useNavigate()

  // Normalised state: { checkpoint, criteria, allCheckpoints }
  const [checkpoint,     setCheckpoint]     = useState(null)
  const [criteria,       setCriteria]       = useState([])
  const [allCheckpoints, setAllCheckpoints] = useState([])

  const [scores,  setScores]  = useState({})   // { criterionId: 1–5 }
  const [notes,   setNotes]   = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!checkpointId) return
    getCheckpoint(checkpointId)
      .then((res) => {
        // res = { success, data: checkpoint, criteria }
        // checkpoint.probationPeriod.checkpoints = sibling checkpoints
        const cp  = res.data
        const cri = res.criteria || []
        const siblings = cp?.probationPeriod?.checkpoints || []

        setCheckpoint(cp)
        setCriteria(cri)
        setAllCheckpoints(siblings)

        // Pre-fill if already submitted
        const existing = cp?.managerEvaluation
        if (existing?.scores?.length) {
          const pre = {}
          existing.scores.forEach((s) => { pre[s.criterion_id] = s.raw_score })
          setScores(pre)
          // performance note is stored in PerformanceNote, not on the evaluation itself
        }
      })
      .catch(() => setError('Failed to load checkpoint details.'))
      .finally(() => setLoading(false))
  }, [checkpointId])

  // Live weighted score preview
  const liveScore = useMemo(() => {
    return criteria.reduce((sum, c) => {
      const raw = scores[c.criterion_id] || 0
      return sum + calcContribution(raw, c.weight_percent)
    }, 0)
  }, [scores, criteria])

  const allScored = useMemo(
    () => criteria.length > 0 && criteria.every((c) => (scores[c.criterion_id] || 0) > 0),
    [scores, criteria]
  )

  // Already submitted if managerEvaluation exists
  const alreadySubmitted = !!checkpoint?.managerEvaluation?.eval_id

  const handleSubmit = async () => {
    if (!allScored) { setError('Please rate all criteria before submitting.'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        scores: Object.entries(scores).map(([criterion_id, raw_score]) => ({
          criterion_id: parseInt(criterion_id, 10),
          raw_score,
        })),
        performance_notes: notes.trim() || null,
      }
      await submitManagerEvaluation(checkpointId, payload)
      setSuccess(true)
      setTimeout(() => navigate('/manager/team'), 2000)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to submit evaluation.')
    } finally {
      setSaving(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      </AppShell>
    )
  }

  if (!checkpoint) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4" /> Checkpoint not found.
        </div>
      </AppShell>
    )
  }

  const employee = checkpoint.probationPeriod?.employeeProfile
  const rec      = deriveRecommendation(liveScore)
  const checkpointIdNum = parseInt(checkpointId, 10)

  return (
    <AppShell>
      {/* Back */}
      <button
        onClick={() => navigate('/manager/team')}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Back to My Team
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Probation Evaluation — {checkpoint.checkpoint_label}
        </h1>
        {employee && (
          <p className="mt-1 text-sm text-slate-500">
            {employee.user?.first_name} {employee.user?.last_name} ·{' '}
            {employee.job_title || '—'} ·{' '}
            Due {fmtDate(checkpoint.checkpoint_date)}
          </p>
        )}
      </div>

      {/* Banners */}
      {success && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Evaluation submitted successfully. Redirecting to team overview…
        </div>
      )}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}
      {alreadySubmitted && !success && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700 ring-1 ring-blue-200">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          This evaluation has already been submitted. Scores shown in read-only mode.
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ── LEFT: Form ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-slate-400" />
              <h2 className="font-semibold text-slate-800">Evaluation Criteria</h2>
            </div>

            {criteria.length === 0 ? (
              <p className="text-sm text-slate-400">
                No evaluation criteria configured. Ask the System Administrator to set up criteria first.
              </p>
            ) : (
              <div className="space-y-5">
                {criteria.map((c) => (
                  <div key={c.criterion_id}>
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{c.name}</p>
                        {c.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{c.description}</p>
                        )}
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {c.weight_percent}%
                      </span>
                    </div>
                    <StarRating
                      value={scores[c.criterion_id] || 0}
                      onChange={(v) => setScores((prev) => ({ ...prev, [c.criterion_id]: v }))}
                      disabled={alreadySubmitted}
                    />
                    {(scores[c.criterion_id] || 0) > 0 && (
                      <p className="mt-1 text-xs text-slate-400">
                        Contribution: {calcContribution(scores[c.criterion_id], c.weight_percent).toFixed(2)} pts
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-3 font-semibold text-slate-800">Performance Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={alreadySubmitted}
              rows={5}
              placeholder="Add observations, achievements, or areas for improvement…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
            />
          </div>

          {/* Buttons */}
          {!alreadySubmitted && !success && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/manager/team')}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || !allScored}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Submitting…' : 'Submit Evaluation'}
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT: Score + history ─────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Score card */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-slate-400" />
              <h2 className="font-semibold text-slate-800">
                {alreadySubmitted ? 'Final Score' : 'Preview Score'}
              </h2>
            </div>
            <div className="flex flex-col items-center py-4">
              <div
                className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold shadow-inner"
                style={{ backgroundColor: rec.bg, color: rec.colour }}
              >
                {liveScore.toFixed(1)}
              </div>
              <p className="mt-3 text-xs font-medium" style={{ color: rec.colour }}>/ 100 pts</p>
            </div>
            <div className="mt-2 rounded-lg px-3 py-2.5 text-center" style={{ backgroundColor: rec.bg }}>
              <p className="text-xs font-semibold" style={{ color: rec.colour }}>Recommendation Threshold</p>
              <p className="mt-0.5 text-sm font-bold" style={{ color: rec.colour }}>{rec.label}</p>
            </div>
            <div className="mt-4 space-y-1.5 text-xs text-slate-500">
              <div className="flex items-center justify-between">
                <span>≥ 75 pts</span>
                <span className="font-medium text-green-600">Confirm Employment</span>
              </div>
              <div className="flex items-center justify-between">
                <span>50 – 74 pts</span>
                <span className="font-medium text-yellow-700">Extend Probation</span>
              </div>
              <div className="flex items-center justify-between">
                <span>&lt; 50 pts</span>
                <span className="font-medium text-red-600">Recommend Dismissal</span>
              </div>
            </div>
          </div>

          {/* Checkpoint history */}
          {allCheckpoints.length > 0 && (
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 font-semibold text-slate-800">Checkpoint History</h2>
              <div className="space-y-2">
                {allCheckpoints.map((cp) => (
                  <HistoryEntry key={cp.checkpoint_id} cp={cp} currentId={checkpointIdNum} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
