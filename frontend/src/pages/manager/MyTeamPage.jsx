// =============================================================================
// src/pages/manager/MyTeamPage.jsx
// Manager — My Team overview: probation progress, checkpoints, actions.
// Matches Figma 12:31.
// FR-11, FR-17 | Objective 4 | LINE_MANAGER
//
// API response from GET /api/evaluations/manager/my-team:
//   Array of EmployeeProfile, each with:
//     .user            { user_id, first_name, last_name, email }
//     .probationPeriods[] (status=ACTIVE only, may be empty)
//       .checkpoints[]
//         .managerEvaluation { eval_id, weighted_score, submitted_at }
//   Profile own fields: profile_id, job_title, department_id, start_date, probation_end_date
//
// Field names confirmed:
//   ManagerEvaluation: eval_id, weighted_score (NOT total_weighted_score)
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { getMyTeam } from '@/api/evaluationApi'
import { Loader2, AlertCircle, Users, ChevronRight } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const probationPercent = (startDate, endDate) => {
  if (!startDate || !endDate) return 0
  const now   = Date.now()
  const start = new Date(startDate).getTime()
  const end   = new Date(endDate).getTime()
  if (now >= end)   return 100
  if (now <= start) return 0
  return Math.round(((now - start) / (end - start)) * 100)
}

const probationDay = (startDate) => {
  if (!startDate) return 0
  const diff = Date.now() - new Date(startDate).getTime()
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)))
}

const isPast = (date) => date && new Date(date) < new Date()

// Derive status from checkpoints
const deriveStatus = (checkpoints = []) => {
  if (checkpoints.some((c) => c.status === 'OVERDUE'))  return 'OVERDUE'
  if (checkpoints.some((c) => c.status === 'PENDING' && isPast(c.due_date))) return 'AT_RISK'
  return 'ON_TRACK'
}

const STATUS_CONFIG = {
  ON_TRACK: { label: 'On Track', bg: '#dcfce7', text: '#15803d' },
  AT_RISK:  { label: 'At Risk',  bg: '#fef9c3', text: '#854d0e' },
  OVERDUE:  { label: 'Overdue',  bg: '#fee2e2', text: '#b91c1c' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ON_TRACK
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  )
}

// Checkpoint score pill — uses weighted_score (confirmed field name)
function CheckpointPill({ checkpoint }) {
  if (!checkpoint) return <span className="text-slate-300 text-xs">—</span>
  const score = checkpoint.managerEvaluation?.weighted_score
  if (score != null) {
    const s = parseFloat(score)
    const colour = s >= 75 ? '#15803d' : s >= 50 ? '#854d0e' : '#b91c1c'
    return (
      <span
        className="inline-block rounded-full px-2 py-0.5 text-xs font-bold"
        style={{ backgroundColor: colour + '22', color: colour }}
      >
        {s.toFixed(1)}
      </span>
    )
  }
  if (checkpoint.status === 'OVERDUE') {
    return <span className="text-xs font-medium text-red-500">Overdue</span>
  }
  return <span className="text-xs text-slate-400">Pending</span>
}

// Action button
function ActionButton({ profile, probation, onAction }) {
  const checkpoints   = probation?.checkpoints || []
  const pendingOrOverdue = checkpoints.find(
    (c) => (c.status === 'OVERDUE' || c.status === 'PENDING') && !c.managerEvaluation
  )
  if (pendingOrOverdue) {
    return (
      <button
        onClick={() => onAction(pendingOrOverdue.checkpoint_id)}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
        style={{ backgroundColor: '#1e3a5f' }}
      >
        {pendingOrOverdue.status === 'OVERDUE' ? 'Submit Now' : 'Start Evaluation'}
        <ChevronRight className="h-3 w-3" />
      </button>
    )
  }
  return (
    <button
      onClick={() => onAction(null, profile.profile_id)}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      View Profile <ChevronRight className="h-3 w-3" />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyTeamPage() {
  const [team,    setTeam]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    getMyTeam()
      .then(setTeam)
      .catch(() => setError('Failed to load team data.'))
      .finally(() => setLoading(false))
  }, [])

  const handleAction = (checkpointId, profileId) => {
    if (checkpointId) {
      navigate(`/manager/evaluations/${checkpointId}`)
    } else if (profileId) {
      navigate(`/hr/employees/${profileId}`)
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>My Team</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor onboarding progress and probation evaluations for your direct reports
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && team.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl bg-white py-24 text-center shadow-sm ring-1 ring-slate-200">
          <Users className="mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No team members assigned yet.</p>
          <p className="mt-1 text-xs text-slate-400">Employees will appear here once assigned to you by HR.</p>
        </div>
      )}

      {!loading && !error && team.length > 0 && (
        <div className="space-y-4">
          {team.map((member) => {
            // member = EmployeeProfile with .user and .probationPeriods[]
            const user        = member.user
            const probation   = member.probationPeriods?.[0]   // first (and only) active period
            const checkpoints = probation?.checkpoints || []
            const status      = deriveStatus(checkpoints)

            // Probation period progress
            const pDay = probationDay(probation?.start_date)
            const pPct = probationPercent(probation?.start_date, probation?.end_date)

            // Find checkpoints by day_number (30, 60, 90)
            const cp30 = checkpoints.find((c) => c.day_number === 30)
            const cp60 = checkpoints.find((c) => c.day_number === 60)
            const cp90 = checkpoints.find((c) => c.day_number === 90)

            return (
              <div
                key={member.profile_id}
                className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-slate-300 transition-all"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Avatar + info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div
                      className="flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: '#1e3a5f' }}
                    >
                      {user?.first_name?.[0]}{user?.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">
                          {user?.first_name} {user?.last_name}
                        </span>
                        <StatusBadge status={status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {member.job_title || '—'}
                      </p>
                      {probation && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          Started {fmtDate(probation.start_date)} · End {fmtDate(probation.end_date)}
                        </p>
                      )}
                    </div>
                  </div>

                  <ActionButton
                    profile={member}
                    probation={probation}
                    onAction={handleAction}
                  />
                </div>

                {/* Probation progress bar */}
                {probation && (
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span>Probation Progress</span>
                      <span className="font-medium">Day {pDay} · {pPct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${pPct}%`,
                          backgroundColor: pPct >= 80 ? '#15803d' : pPct >= 40 ? '#1e3a5f' : '#94a3b8',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Checkpoint scores */}
                {checkpoints.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600">30-day:</span>
                      <CheckpointPill checkpoint={cp30} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600">60-day:</span>
                      <CheckpointPill checkpoint={cp60} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-slate-600">90-day:</span>
                      <CheckpointPill checkpoint={cp90} />
                    </div>

                    {/* Final recommendation if available */}
                    {probation?.finalRecommendation && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-medium text-slate-600">Outcome:</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold"
                          style={{
                            backgroundColor:
                              probation.finalRecommendation.recommendation_type === 'CONFIRM' ? '#dcfce7' :
                              probation.finalRecommendation.recommendation_type === 'EXTEND'  ? '#fef9c3' : '#fee2e2',
                            color:
                              probation.finalRecommendation.recommendation_type === 'CONFIRM' ? '#15803d' :
                              probation.finalRecommendation.recommendation_type === 'EXTEND'  ? '#854d0e' : '#b91c1c',
                          }}
                        >
                          {probation.finalRecommendation.recommendation_type}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
