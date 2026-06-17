// =============================================================================
// src/pages/employee/assessments/SelfAssessmentPage.jsx
// Employee Self-Assessment form — star ratings + reflection notes.
// Matches Figma 12:37.
// FR-13, FR-14 | Objective 2 | NEW_EMPLOYEE
//
// API response from GET /api/evaluations/checkpoint/:id:
//   { success, data: <EvaluationCheckpoint>, criteria: [...] }
//   checkpoint.selfAssessment = existing submission (if any)
//   checkpoint.managerEvaluation = manager's score (for comparison)
//
// Field names confirmed:
//   EvaluationCriterion: criterion_id, name, weight_percent
//   SelfAssessment: assessment_id, self_reflection_notes, self_score
//   SelfAssessmentScore: criterion_id, raw_score
//   ManagerEvaluation: eval_id, weighted_score
// =============================================================================

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { getMyProbation, getCheckpoint, submitSelfAssessment } from '@/api/evaluationApi'
import {
  Star, Loader2, AlertCircle, CheckCircle2, ChevronLeft,
  ClipboardList, Info
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const calcScore = (scoresMap, criteria) =>
  criteria.reduce((sum, c) => {
    const raw = scoresMap[c.criterion_id] || 0
    return sum + parseFloat(((raw / 5.0) * parseFloat(c.weight_percent)).toFixed(2))
  }, 0)

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Checkpoint selector ───────────────────────────────────────────────────────
function CheckpointSelector({ checkpoints, selected, onSelect }) {
  // FR-13: show checkpoints where the employee has not yet submitted a self-assessment,
  // regardless of whether the manager has already evaluated (checkpoint.status may be
  // 'COMPLETED' after manager evaluation, but the employee's self-assessment is independent).
  const pending = checkpoints.filter((c) => !c.selfAssessment?.assessment_id)
  if (!pending.length) return null
  return (
    <div className="mb-6">
      <p className="mb-2 text-sm font-medium text-slate-700">Select Checkpoint</p>
      <div className="flex flex-wrap gap-2">
        {pending.map((c) => (
          <button
            key={c.checkpoint_id}
            onClick={() => onSelect(c.checkpoint_id)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              selected === c.checkpoint_id
                ? 'border-transparent text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            style={selected === c.checkpoint_id ? { backgroundColor: '#1e3a5f' } : {}}
          >
            {c.checkpoint_label}
            {c.status === 'OVERDUE' && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                Overdue
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SelfAssessmentPage() {
  const navigate = useNavigate()

  const [probation,          setProbation]          = useState(null)
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null)
  const [checkpoint,         setCheckpoint]         = useState(null)   // EvaluationCheckpoint object
  const [criteria,           setCriteria]           = useState([])

  const [scores,  setScores]  = useState({})
  const [notes,   setNotes]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [success, setSuccess] = useState(false)

  const [loadingProbation,  setLoadingProbation]  = useState(true)
  const [loadingCheckpoint, setLoadingCheckpoint] = useState(false)

  // Load probation on mount
  useEffect(() => {
    getMyProbation()
      .then((data) => {
        setProbation(data)
        // Auto-select first checkpoint where employee has not yet submitted a self-assessment
        const first = data?.checkpoints?.find((c) => !c.selfAssessment?.assessment_id)
        if (first) setSelectedCheckpoint(first.checkpoint_id)
      })
      .catch(() => setError('Failed to load your probation details.'))
      .finally(() => setLoadingProbation(false))
  }, [])

  // Load checkpoint detail on selection change
  useEffect(() => {
    if (!selectedCheckpoint) return
    setLoadingCheckpoint(true)
    setCheckpoint(null)
    setCriteria([])
    setScores({})
    setNotes('')
    setError(null)
    getCheckpoint(selectedCheckpoint)
      .then((res) => {
        // res = { success, data: checkpoint, criteria }
        const cp  = res.data
        const cri = res.criteria || []
        setCheckpoint(cp)
        setCriteria(cri)

        // Pre-fill if self-assessment already submitted
        const existing = cp?.selfAssessment
        if (existing?.scores?.length) {
          const pre = {}
          existing.scores.forEach((s) => { pre[s.criterion_id] = s.raw_score })
          setScores(pre)
          setNotes(existing.self_reflection_notes || '')  // confirmed model field name
        }
      })
      .catch(() => setError('Failed to load checkpoint details.'))
      .finally(() => setLoadingCheckpoint(false))
  }, [selectedCheckpoint])

  // Derived
  const liveScore        = useMemo(() => calcScore(scores, criteria), [scores, criteria])
  const allScored        = useMemo(
    () => criteria.length > 0 && criteria.every((c) => (scores[c.criterion_id] || 0) > 0),
    [scores, criteria]
  )
  const alreadySubmitted = !!checkpoint?.selfAssessment?.assessment_id  // confirmed PK name
  const managerEval      = checkpoint?.managerEvaluation

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
        self_reflection_notes: notes.trim() || null,  // confirmed backend body param (evaluationController.js:505)
      }
      await submitSelfAssessment(selectedCheckpoint, payload)
      setSuccess(true)
      setTimeout(() => navigate('/employee/dashboard'), 2500)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to submit self-assessment.')
    } finally {
      setSaving(false)
    }
  }

  // ── Initial loading ───────────────────────────────────────────────────────
  if (loadingProbation) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      </AppShell>
    )
  }

  if (!probation) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700 ring-1 ring-amber-200">
          <Info className="h-4 w-4 flex-shrink-0" />
          No active probation period found. Please contact HR if you believe this is an error.
        </div>
      </AppShell>
    )
  }

  const checkpoints  = probation.checkpoints || []
  // allCompleted: true only when the employee has submitted self-assessments for every checkpoint.
  // Checking checkpoint.status would be wrong — a manager may have submitted evaluations
  // (which sets status to COMPLETED) before the employee self-assessed.
  const allCompleted = checkpoints.length > 0 && checkpoints.every((c) => !!c.selfAssessment?.assessment_id)

  if (allCompleted) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          All probation checkpoints are complete. No further self-assessments are required.
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      {/* Back */}
      <button
        onClick={() => navigate('/employee/dashboard')}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Self-Assessment{checkpoint ? ` — ${checkpoint.checkpoint_label}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Rate yourself honestly on each evaluation criterion
          {checkpoint?.due_date ? ` · Due ${fmtDate(checkpoint.due_date)}` : ''}
        </p>
      </div>

      {/* Checkpoint selector */}
      <CheckpointSelector
        checkpoints={checkpoints}
        selected={selectedCheckpoint}
        onSelect={(id) => { setSelectedCheckpoint(id); setSuccess(false) }}
      />

      {/* Banners */}
      {success && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Self-assessment submitted successfully. Redirecting to your dashboard…
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
          You have already submitted your self-assessment for this checkpoint. Shown in read-only mode.
        </div>
      )}

      {/* Checkpoint loading spinner */}
      {loadingCheckpoint && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
        </div>
      )}

      {/* Form + right panel */}
      {!loadingCheckpoint && checkpoint && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* ── LEFT: Form ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-slate-400" />
                <h2 className="font-semibold text-slate-800">Rate Yourself</h2>
              </div>
              {criteria.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No criteria configured. Please contact your System Administrator.
                </p>
              ) : (
                <div className="space-y-6">
                  {criteria.map((c) => (
                    <div key={c.criterion_id}>
                      <div className="mb-2 flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{c.name}</p>
                          {c.description && (
                            <p className="mt-0.5 text-xs text-slate-400">{c.description}</p>
                          )}
                        </div>
                        <span className="ml-3 flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                          {c.weight_percent}%
                        </span>
                      </div>
                      <StarRating
                        value={scores[c.criterion_id] || 0}
                        onChange={(v) => setScores((prev) => ({ ...prev, [c.criterion_id]: v }))}
                        disabled={alreadySubmitted}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reflection notes */}
            <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 font-semibold text-slate-800">Self-Reflection Notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={alreadySubmitted}
                rows={5}
                placeholder="Describe your achievements, challenges, and areas where you have grown or need improvement…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
              />
            </div>

            {!alreadySubmitted && !success && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || !allScored}
                  className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Submitting…' : 'Submit Self-Assessment'}
                </button>
              </div>
            )}
          </div>

          {/* ── RIGHT: Score preview ────────────────────────────────────── */}
          <div className="space-y-5">
            {/* Self score */}
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-4 font-semibold text-slate-800">Your Score Preview</h2>
              <div className="flex flex-col items-center py-4">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full text-xl font-bold shadow-inner"
                  style={{
                    backgroundColor: liveScore >= 75 ? '#dcfce7' : liveScore >= 50 ? '#fef9c3' : '#fee2e2',
                    color:            liveScore >= 75 ? '#15803d' : liveScore >= 50 ? '#854d0e' : '#b91c1c',
                  }}
                >
                  {liveScore.toFixed(1)}
                </div>
                <p className="mt-2 text-xs text-slate-400">/ 100 pts (self)</p>
              </div>
            </div>

            {/* Manager comparison info box */}
            <div className="rounded-xl bg-slate-50 p-5 ring-1 ring-slate-100">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your self-assessment will be compared with your manager's evaluation. Both are reviewed by HR as part of your probation record.
                </p>
              </div>

              {/* Manager score if available — uses weighted_score field */}
              {managerEval && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="mb-2 text-xs font-medium text-slate-600">Manager's Score (this checkpoint)</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                      style={{
                        backgroundColor: parseFloat(managerEval.weighted_score) >= 75 ? '#dcfce7'
                          : parseFloat(managerEval.weighted_score) >= 50 ? '#fef9c3' : '#fee2e2',
                        color: parseFloat(managerEval.weighted_score) >= 75 ? '#15803d'
                          : parseFloat(managerEval.weighted_score) >= 50 ? '#854d0e' : '#b91c1c',
                      }}
                    >
                      {parseFloat(managerEval.weighted_score).toFixed(1)}
                    </div>
                    <p className="text-xs text-slate-500">Manager evaluation submitted</p>
                  </div>
                </div>
              )}
            </div>

            {/* All checkpoints summary */}
            <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">All Checkpoints</h2>
              <div className="space-y-2">
                {checkpoints.map((c) => (
                  <div key={c.checkpoint_id} className="flex items-center justify-between text-xs">
                    <span className={`font-medium ${c.checkpoint_id === selectedCheckpoint ? 'text-blue-700' : 'text-slate-600'}`}>
                      {c.checkpoint_label}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: c.status === 'COMPLETED' ? '#dcfce7' : c.status === 'OVERDUE' ? '#fee2e2' : '#f1f5f9',
                        color:            c.status === 'COMPLETED' ? '#15803d' : c.status === 'OVERDUE' ? '#b91c1c' : '#64748b',
                      }}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
