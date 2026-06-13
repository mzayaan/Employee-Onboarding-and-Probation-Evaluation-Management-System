// =============================================================================
// src/pages/manager/ManagerDashboard.jsx
// Line Manager dashboard — matches Figma 12:30.
// 4 stat cards + team probation table.
// FR-08, FR-17 | Objective 4
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { Users, BarChart3, ClipboardList, AlertTriangle, Loader2, AlertCircle } from 'lucide-react'
import { getOnboardingProgress } from '@/api/dashboardApi'
import { getAllAssignments } from '@/api/taskApi'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ProbBadge({ status }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>
  const map = {
    ACTIVE:    'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-green-100 text-green-700',
    EXTENDED:  'bg-amber-100 text-amber-700',
    DISMISSED: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function ProgressBar({ value }) {
  const colour = value >= 80 ? '#16a34a' : value >= 40 ? '#f59e0b' : '#dc2626'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: colour }} />
      </div>
      <span className="text-xs font-medium text-slate-600">{value}%</span>
    </div>
  )
}

export default function ManagerDashboard() {
  const { user } = useAuth()

  const [teamData,     setTeamData]     = useState([])
  const [assignments,  setAssignments]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    Promise.all([getOnboardingProgress(), getAllAssignments()])
      .then(([progress, tasks]) => {
        setTeamData(progress)
        setAssignments(tasks)
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false))
  }, [])

  const teamSize   = teamData.length
  const tasksOD    = assignments.filter((a) => a.status !== 'COMPLETED' && new Date(a.due_date) < new Date()).length
  const avgScore   = teamData.length > 0
    ? Math.round(teamData.reduce((sum, e) => sum + (e.task_progress || 0), 0) / teamData.length)
    : 0

  const STAT_CARDS = [
    {
      label: 'My Team Size',
      value: loading ? '—' : teamSize,
      icon: Users,
      color: '#1e3a5f',
    },
    {
      label: 'Pending Evaluations',
      value: '—',            // Evaluation module not yet implemented
      icon: BarChart3,
      color: '#f59e0b',
    },
    {
      label: 'Avg Team Progress',
      value: loading ? '—' : `${avgScore}%`,
      icon: ClipboardList,
      color: '#3d7dd3',
    },
    {
      label: 'Tasks Overdue',
      value: loading ? '—' : tasksOD,
      icon: AlertTriangle,
      color: '#dc2626',
    },
  ]

  return (
    <AppShell>
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Welcome, {user?.first_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Line Manager Dashboard — manage your team's onboarding and probation evaluations
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* 4 Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200"
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: color + '18' }}
            >
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
                {loading && value === '—'
                  ? <span className="animate-pulse text-slate-300">—</span>
                  : value}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Team table */}
      <div className="mt-8 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-800">My Team — Onboarding & Probation Overview</h2>
          <p className="mt-0.5 text-xs text-slate-400">Progress and probation status for your team members</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : teamData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-xs text-slate-400">
            <Users className="h-10 w-10 text-slate-200 mb-2" />
            No team members found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Employee', 'Department', 'Start Date', 'Probation End', 'Onboarding %', 'Probation', 'Days Left'].map(h => (
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
                {teamData.map((emp) => (
                  <tr key={emp.profile_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ backgroundColor: '#1e3a5f' }}
                        >
                          {emp.first_name?.[0]}{emp.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs text-slate-400">{emp.job_title || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{emp.department ?? '—'}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(emp.start_date)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 whitespace-nowrap">{formatDate(emp.probation_end_date)}</td>
                    <td className="px-5 py-3.5 min-w-[140px]">
                      <ProgressBar value={emp.task_progress ?? 0} />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <ProbBadge status={emp.probation_status} />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-600">
                      {emp.probation_days_left !== null && emp.probation_days_left !== undefined
                        ? emp.probation_days_left > 0
                          ? `${emp.probation_days_left}d`
                          : <span className="text-red-500 font-medium">Expired</span>
                        : '—'}
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
