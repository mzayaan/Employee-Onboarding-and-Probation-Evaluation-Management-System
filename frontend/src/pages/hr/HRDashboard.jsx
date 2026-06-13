// =============================================================================
// src/pages/hr/HRDashboard.jsx
// HR Administrator dashboard — live stat cards + per-employee onboarding
// progress table.  FR-08, FR-17 | Objective 4
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { Users, FileText, ClipboardList, AlertTriangle } from 'lucide-react'
import { getDashboardStats, getOnboardingProgress } from '@/api/dashboardApi'

// Progress bar component
function ProgressBar({ value }) {
  const colour =
    value >= 80 ? '#16a34a' :
    value >= 40 ? '#f59e0b' : '#dc2626'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: colour }}
        />
      </div>
      <span className="w-9 text-right text-xs font-medium text-slate-600">{value}%</span>
    </div>
  )
}

// Status badge for probation
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

export default function HRDashboard() {
  const { user } = useAuth()

  const [stats, setStats]       = useState(null)
  const [progress, setProgress] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [s, p] = await Promise.all([getDashboardStats(), getOnboardingProgress()])
        setStats(s)
        setProgress(p)
      } catch (err) {
        console.error(err)
        setError('Failed to load dashboard data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const STAT_CARDS = [
    { label: 'Total Employees',   value: stats?.totalEmployees   ?? '—', icon: Users,         color: '#1e3a5f' },
    { label: 'Pending Documents', value: stats?.pendingDocuments ?? '—', icon: FileText,      color: '#f59e0b' },
    { label: 'Active Probations', value: stats?.activeProbations ?? '—', icon: ClipboardList, color: '#3d7dd3' },
    { label: 'Overdue Tasks',     value: stats?.overdueTasks     ?? '—', icon: AlertTriangle,  color: '#dc2626' },
  ]

  return (
    <AppShell>
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Welcome, {user?.first_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          HR Administrator Dashboard — overview of onboarding and probation activity
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Stat cards */}
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
                {loading ? <span className="animate-pulse text-slate-300">—</span> : value}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* MidRow: Recent Employees + Recent Activity */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* Left panel — Recent Employees table */}
        <div className="lg:col-span-3 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Recent Employees</h2>
            <p className="mt-0.5 text-xs text-slate-400">Onboarding progress and probation status</p>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400 animate-pulse">Loading…</div>
          ) : progress.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">No employee records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Employee', 'Department', 'Onboarding %', 'Probation', 'Days Left'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {progress.slice(0, 8).map((emp) => (
                    <tr key={emp.profile_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-medium text-slate-800">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-slate-400">{emp.job_title}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{emp.department ?? '—'}</td>
                      <td className="px-4 py-3 min-w-[120px]">
                        <ProgressBar value={emp.task_progress} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ProbBadge status={emp.probation_status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                        {emp.probation_days_left !== null
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

        {/* Right panel — Recent Activity */}
        <div className="lg:col-span-2 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
            <p className="mt-0.5 text-xs text-slate-400">Onboarding and document events</p>
          </div>

          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400 animate-pulse">Loading…</div>
            ) : progress.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-400">No activity yet.</div>
            ) : (
              (() => {
                const items = []
                progress.forEach((emp) => {
                  const name = `${emp.first_name} ${emp.last_name}`
                  if (emp.overdue_tasks > 0)
                    items.push({ dot: '#dc2626', text: `${name} has ${emp.overdue_tasks} overdue task${emp.overdue_tasks > 1 ? 's' : ''}` })
                  if (emp.pending_docs > 0)
                    items.push({ dot: '#f59e0b', text: `${name} submitted ${emp.pending_docs} document${emp.pending_docs > 1 ? 's' : ''} pending review` })
                  if (emp.rejected_docs > 0)
                    items.push({ dot: '#dc2626', text: `${name} has ${emp.rejected_docs} rejected document${emp.rejected_docs > 1 ? 's' : ''}` })
                  if (emp.task_progress === 100)
                    items.push({ dot: '#16a34a', text: `${name} completed all onboarding tasks` })
                })
                if (items.length === 0)
                  progress.slice(0, 5).forEach((emp) => {
                    items.push({ dot: '#3d7dd3', text: `${emp.first_name} ${emp.last_name} — ${emp.task_progress}% onboarding complete` })
                  })
                return items.slice(0, 8).map((item, i) => (
                  <div key={i} className="flex items-start gap-3 px-6 py-3">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: item.dot }} />
                    <p className="text-xs text-slate-600 leading-relaxed">{item.text}</p>
                  </div>
                ))
              })()
            )}
          </div>
        </div>

      </div>
    </AppShell>
  )
}
