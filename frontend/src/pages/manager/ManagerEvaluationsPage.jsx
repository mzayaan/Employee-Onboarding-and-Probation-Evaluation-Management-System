// =============================================================================
// src/pages/manager/ManagerEvaluationsPage.jsx
// Line Manager — list of all pending / overdue evaluation checkpoints across
// the manager's team, with direct links to the evaluation form.
// FR-11, FR-14 | Objective 2
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate }          from 'react-router-dom'
import AppShell                 from '@/components/shared/AppShell'
import { getMyTeam }            from '@/api/evaluationApi'
import {
  BarChart3, CheckCircle, AlertTriangle, Clock, Loader2, AlertCircle,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function StatusBadge({ status }) {
  const map = {
    PENDING:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700',  Icon: Clock          },
    OVERDUE:   { label: 'Overdue',   cls: 'bg-red-100 text-red-700',      Icon: AlertTriangle  },
    COMPLETED: { label: 'Completed', cls: 'bg-green-100 text-green-700',  Icon: CheckCircle    },
  }
  const cfg = map[status] ?? map.PENDING
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ManagerEvaluationsPage() {
  const navigate = useNavigate()

  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getMyTeam()
      .then((members) => {
        // Flatten all checkpoints across all team members, enriched with employee info
        const flat = []
        members.forEach((member) => {
          const name = `${member.user?.first_name ?? ''} ${member.user?.last_name ?? ''}`.trim()
          const jobTitle = member.job_title ?? '—'
          ;(member.probationPeriods ?? []).forEach((period) => {
            ;(period.checkpoints ?? []).forEach((cp) => {
              flat.push({
                checkpointId:      cp.checkpoint_id,
                employeeName:      name,
                jobTitle,
                label:             cp.checkpoint_label,
                dueDate:           cp.due_date,
                status:            cp.status,
                hasManagerEval:    !!cp.managerEvaluation,
                managerScore:      cp.managerEvaluation?.weighted_score ?? null,
              })
            })
          })
        })
        // Sort: OVERDUE first, then PENDING, then COMPLETED
        const order = { OVERDUE: 0, PENDING: 1, COMPLETED: 2 }
        flat.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3))
        setRows(flat)
      })
      .catch(() => setError('Failed to load evaluations.'))
      .finally(() => setLoading(false))
  }, [])

  const pending   = rows.filter((r) => r.status === 'PENDING'   && !r.hasManagerEval).length
  const overdue   = rows.filter((r) => r.status === 'OVERDUE'   && !r.hasManagerEval).length
  const completed = rows.filter((r) => r.hasManagerEval).length

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Evaluations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Probation checkpoints across your team — submit evaluations before deadlines.
          </p>
        </div>
        <BarChart3 className="h-8 w-8 text-slate-200" />
      </div>

      {/* Summary chips */}
      <div className="mb-6 flex flex-wrap gap-3">
        {[
          { label: 'Pending',   value: pending,   colour: '#b45309', bg: '#fef3c7' },
          { label: 'Overdue',   value: overdue,   colour: '#b91c1c', bg: '#fee2e2' },
          { label: 'Completed', value: completed, colour: '#15803d', bg: '#dcfce7' },
        ].map(({ label, value, colour, bg }) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-black/5"
            style={{ backgroundColor: bg, color: colour }}
          >
            {label}: <span className="font-bold">{loading ? '—' : value}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-800">All Checkpoints</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <BarChart3 className="h-10 w-10 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-500 mb-1">No evaluation checkpoints found</p>
            <p className="text-xs text-slate-400 max-w-sm">
              Checkpoints appear here once HR has assigned employees to you. Ask your HR Administrator
              to set your account as the Line Manager when creating or editing employee profiles.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Employee', 'Job Title', 'Checkpoint', 'Due Date', 'Status', 'Score', 'Action'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row) => (
                  <tr key={row.checkpointId} className="hover:bg-slate-50 transition-colors">
                    {/* Employee */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div
                        className="inline-flex items-center gap-2"
                      >
                        <div
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: '#1e3a5f' }}
                        >
                          {row.employeeName?.[0]}
                        </div>
                        <span className="font-medium text-slate-800 text-xs">{row.employeeName}</span>
                      </div>
                    </td>
                    {/* Job title */}
                    <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {row.jobTitle}
                    </td>
                    {/* Checkpoint label */}
                    <td className="px-5 py-3.5 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {row.label}
                    </td>
                    {/* Due date */}
                    <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                      {formatDate(row.dueDate)}
                    </td>
                    {/* Status */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <StatusBadge status={row.status} />
                    </td>
                    {/* Score */}
                    <td className="px-5 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                      {row.hasManagerEval
                        ? <span className="font-semibold" style={{ color: '#1e3a5f' }}>
                            {row.managerScore !== null ? `${parseFloat(row.managerScore).toFixed(1)}%` : '—'}
                          </span>
                        : <span className="text-slate-400">Not submitted</span>}
                    </td>
                    {/* Action */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {row.status === 'COMPLETED' && row.hasManagerEval ? (
                        <button
                          onClick={() => navigate(`/manager/evaluations/${row.checkpointId}`)}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          View
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/manager/evaluations/${row.checkpointId}`)}
                          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                          style={{ backgroundColor: '#1e3a5f' }}
                        >
                          Evaluate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
