// =============================================================================
// src/pages/hr/HRDashboard.jsx
// HR Administrator dashboard — live stat cards, Chart.js charts, and per-employee
// onboarding progress table.
// FR-08, FR-17 | NFR-01 | Objective 4
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import {
  Users,
  FileText,
  ClipboardList,
  AlertTriangle,
  CalendarClock,
  XCircle,
} from 'lucide-react'
import { getDashboardStats, getOnboardingProgress } from '@/api/dashboardApi'

// ── Progress bar ─────────────────────────────────────────────────────────────
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

// ── Probation status badge ────────────────────────────────────────────────────
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

// ── Doughnut chart for onboarding status distribution (FR-17 Chart.js) ───────
function OnboardingStatusChart({ progress }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !progress.length) return

    // Derive segments from task_progress and is_active (fields present in getOnboardingProgress)
    const completed  = progress.filter((e) => e.is_active && e.task_progress === 100).length
    const inProgress = progress.filter((e) => e.is_active && e.task_progress < 100).length
    const inactive   = progress.filter((e) => !e.is_active).length

    // Destroy previous chart instance to prevent memory leaks
    if (chartRef.current) {
      chartRef.current.destroy()
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: ['In Progress', 'Completed', 'Inactive'],
        datasets: [
          {
            data: [inProgress, completed, inactive],
            backgroundColor: ['#3d7dd3', '#16a34a', '#94a3b8'],
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { size: 11, family: 'Inter, sans-serif' },
              color: '#475569',
              padding: 14,
              usePointStyle: true,
              pointStyleWidth: 10,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} employee${ctx.parsed !== 1 ? 's' : ''}`,
            },
          },
        },
      },
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [progress])

  return <canvas ref={canvasRef} />
}

// ── Task completion bar chart ─────────────────────────────────────────────────
function TaskProgressChart({ progress }) {
  const canvasRef = useRef(null)
  const chartRef  = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || !progress.length) return

    // Take the 6 most recent employees for readability
    const slice  = progress.slice(0, 6)
    const labels = slice.map((e) => `${e.first_name} ${e.last_name?.[0]}.`)
    const values = slice.map((e) => e.task_progress)

    if (chartRef.current) {
      chartRef.current.destroy()
    }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Onboarding Task Completion (%)',
            data:  values,
            backgroundColor: values.map((v) =>
              v >= 80 ? '#16a34a' :
              v >= 40 ? '#f59e0b' : '#dc2626'
            ),
            borderRadius: 4,
            barPercentage: 0.55,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              callback: (v) => `${v}%`,
              font: { size: 10 },
              color: '#64748b',
            },
            grid: { color: '#f1f5f9' },
          },
          x: {
            ticks: { font: { size: 10 }, color: '#475569' },
            grid:  { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y}% tasks completed`,
            },
          },
        },
      },
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [progress])

  return <canvas ref={canvasRef} />
}

// =============================================================================
// Main HRDashboard component
// =============================================================================
export default function HRDashboard() {
  const { user } = useAuth()

  const [stats,    setStats]    = useState(null)
  const [progress, setProgress] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

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

  // Six stat cards: original 4 + 2 new evaluation cards (FR-17)
  const STAT_CARDS = [
    { label: 'Total Employees',        value: stats?.totalEmployees        ?? '—', icon: Users,        color: '#1e3a5f' },
    { label: 'Pending Documents',      value: stats?.pendingDocuments      ?? '—', icon: FileText,     color: '#f59e0b' },
    { label: 'Active Probations',      value: stats?.activeProbations      ?? '—', icon: ClipboardList, color: '#3d7dd3' },
    { label: 'Overdue Tasks',          value: stats?.overdueTasks          ?? '—', icon: AlertTriangle, color: '#dc2626' },
    { label: 'Upcoming Evaluations',   value: stats?.upcomingEvaluations   ?? '—', icon: CalendarClock, color: '#7c3aed' },
    { label: 'Overdue Evaluations',    value: stats?.overdueEvaluations    ?? '—', icon: XCircle,       color: '#ea580c' },
  ]

  return (
    <AppShell>
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Welcome, {user?.first_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          HR Administrator Dashboard — onboarding, probation and evaluation overview
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Stat cards — 6-column grid (FR-17) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {STAT_CARDS.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex flex-col items-start gap-3 rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: color + '18' }}
            >
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
                {loading ? <span className="animate-pulse text-slate-300">—</span> : value}
              </p>
              <p className="text-xs text-slate-500 leading-tight mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart row: Onboarding Status (donut) + Task Progress (bar) */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Onboarding status distribution — doughnut chart (FR-17) */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800">Onboarding Status Distribution</h2>
          <p className="mt-0.5 mb-4 text-xs text-slate-400">Active employee onboarding completion breakdown</p>
          <div className="h-52">
            {!loading && progress.length > 0
              ? <OnboardingStatusChart progress={progress} />
              : <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  {loading ? 'Loading…' : 'No employee data available.'}
                </div>
            }
          </div>
        </div>

        {/* Task completion bar chart (FR-17, FR-08) */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800">Task Completion by Employee</h2>
          <p className="mt-0.5 mb-4 text-xs text-slate-400">Onboarding task progress for the most recent employees</p>
          <div className="h-52">
            {!loading && progress.length > 0
              ? <TaskProgressChart progress={progress} />
              : <div className="flex h-full items-center justify-center text-xs text-slate-400">
                  {loading ? 'Loading…' : 'No employee data available.'}
                </div>
            }
          </div>
        </div>

      </div>

      {/* Bottom row: Recent Employees table + Recent Activity */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* Left — Recent Employees table */}
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
                    {['Employee', 'Department', 'Onboarding %', 'Probation', 'Days Left'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                      >
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

        {/* Right — Recent Activity */}
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
