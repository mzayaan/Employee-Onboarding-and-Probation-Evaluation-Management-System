// =============================================================================
// src/pages/employee/tasks/MyTasksPage.jsx
// Employee views their onboarding tasks and updates status.
// FR-08 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getMyTasks, updateTaskStatus } from '@/api/taskApi'
import {
  ClipboardList, CheckCircle, Clock, AlertTriangle,
  Loader2, AlertCircle,
} from 'lucide-react'

const STATUS_CONFIG = {
  TODO:        { label: 'To Do',       icon: Clock,         bg: '#f1f5f9', color: '#475569' },
  IN_PROGRESS: { label: 'In Progress', icon: AlertTriangle, bg: '#fef3c7', color: '#b45309' },
  COMPLETED:   { label: 'Completed',   icon: CheckCircle,   bg: '#dcfce7', color: '#15803d' },
}

const PRIORITY_CONFIG = {
  LOW:    { label: 'Low',    color: '#475569' },
  MEDIUM: { label: 'Medium', color: '#b45309' },
  HIGH:   { label: 'High',   color: '#b91c1c' },
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(dueDate, status) {
  return status !== 'COMPLETED' && new Date(dueDate) < new Date()
}

const TABS = [
  { key: 'ALL',         label: 'All' },
  { key: 'TODO',        label: 'Pending' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED',   label: 'Completed' },
]

export default function MyTasksPage() {
  const [tasks,     setTasks]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [updating,  setUpdating]  = useState(null)
  const [activeTab, setActiveTab] = useState('ALL')

  useEffect(() => {
    getMyTasks()
      .then(setTasks)
      .catch(() => setError('Failed to load your tasks.'))
      .finally(() => setLoading(false))
  }, [])

  const handleStatusChange = async (assignmentId, newStatus) => {
    setUpdating(assignmentId)
    try {
      const updated = await updateTaskStatus(assignmentId, newStatus)
      setTasks((prev) =>
        prev.map((t) =>
          t.assignment_id === assignmentId
            ? { ...t, status: updated.status, completed_at: updated.completed_at }
            : t
        )
      )
    } catch {
      alert('Failed to update task status.')
    } finally {
      setUpdating(null)
    }
  }

  const total     = tasks.length
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length
  const overdue   = tasks.filter((t) => isOverdue(t.due_date, t.status)).length
  const progress  = total > 0 ? Math.round((completed / total) * 100) : 0

  const filtered = activeTab === 'ALL' ? tasks : tasks.filter((t) => t.status === activeTab)

  // Upcoming deadlines — non-completed tasks sorted by due date
  const upcoming = [...tasks]
    .filter((t) => t.status !== 'COMPLETED' && t.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5)

  // Unique assigners for right panel
  const assigners = [...new Map(
    tasks.filter((t) => t.assigner).map((t) => [t.assigner.user_id, t.assigner])
  ).values()].slice(0, 3)

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>My Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Complete your onboarding tasks to finish the onboarding process.
        </p>
      </div>

      {/* Progress banner */}
      {!loading && !error && total > 0 && (
        <div className="mb-6 rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-700">Onboarding Progress</p>
            <p className="text-sm font-bold" style={{ color: '#1e3a5f' }}>{progress}%</p>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div
              className="h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: '#1e3a5f' }}
            />
          </div>
          <div className="mt-3 flex gap-6 text-xs text-slate-500">
            <span><strong className="text-slate-700">{total}</strong> Total</span>
            <span><strong className="text-green-700">{completed}</strong> Completed</span>
            <span><strong className="text-red-600">{overdue}</strong> Overdue</span>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      {!loading && !error && (
        <div className="mb-4 flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
              style={activeTab === tab.key ? { backgroundColor: '#1e3a5f' } : {}}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Two-column layout: task list + right panel */}
      <div className="flex gap-6 items-start">

        {/* Main task list */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-200">
              <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">
                {activeTab === 'ALL'
                  ? 'No tasks have been assigned to you yet.'
                  : `No ${activeTab === 'TODO' ? 'pending' : activeTab.toLowerCase().replace('_', ' ')} tasks.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((t) => {
                const statusCfg   = STATUS_CONFIG[t.status]   || STATUS_CONFIG.TODO
                const priorityCfg = PRIORITY_CONFIG[t.task?.priority] || PRIORITY_CONFIG.MEDIUM
                const StatusIcon  = statusCfg.icon
                const od          = isOverdue(t.due_date, t.status)

                return (
                  <div
                    key={t.assignment_id}
                    className="rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-slate-800">{t.task?.title}</p>
                          <span className="text-xs font-medium" style={{ color: priorityCfg.color }}>
                            {priorityCfg.label}
                          </span>
                        </div>
                        {t.task?.description && (
                          <p className="text-sm text-slate-500 mb-2">{t.task.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-400">
                          <span>
                            Due:{' '}
                            <span className={od ? 'text-red-600 font-medium' : 'text-slate-600'}>
                              {formatDate(t.due_date)}{od && ' (Overdue)'}
                            </span>
                          </span>
                          {t.completed_at && (
                            <span>Completed: <span className="text-green-600">{formatDate(t.completed_at)}</span></span>
                          )}
                          <span>By: {t.assigner?.first_name} {t.assigner?.last_name}</span>
                        </div>
                      </div>

                      {/* Right — status + buttons */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </span>
                        {t.status !== 'COMPLETED' && (
                          <div className="flex gap-1.5">
                            {t.status === 'TODO' && (
                              <button
                                onClick={() => handleStatusChange(t.assignment_id, 'IN_PROGRESS')}
                                disabled={updating === t.assignment_id}
                                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                              >
                                {updating === t.assignment_id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Start'}
                              </button>
                            )}
                            <button
                              onClick={() => handleStatusChange(t.assignment_id, 'COMPLETED')}
                              disabled={updating === t.assignment_id}
                              className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                            >
                              {updating === t.assignment_id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Mark Complete'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right panel — only shown when data is loaded */}
        {!loading && !error && tasks.length > 0 && (
          <div className="w-60 flex-shrink-0 space-y-4">

            {/* Upcoming Deadlines */}
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Upcoming Deadlines</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {upcoming.length === 0 ? (
                  <p className="px-4 py-4 text-center text-xs text-slate-400">No upcoming deadlines.</p>
                ) : (
                  upcoming.map((t) => {
                    const od = isOverdue(t.due_date, t.status)
                    return (
                      <div key={t.assignment_id} className="px-4 py-2.5">
                        <p className="text-xs font-medium text-slate-700 truncate">{t.task?.title}</p>
                        <p className={`mt-0.5 text-xs ${od ? 'font-medium text-red-500' : 'text-slate-400'}`}>
                          {formatDate(t.due_date)}{od && ' — Overdue'}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Assigned By */}
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Assigned By</h3>
              </div>
              <div className="px-4 py-3 space-y-2.5">
                {assigners.length === 0 ? (
                  <p className="text-center text-xs text-slate-400">—</p>
                ) : (
                  assigners.map((a) => (
                    <div key={a.user_id} className="flex items-center gap-2.5">
                      <div
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: '#1e3a5f' }}
                      >
                        {a.first_name?.[0]}{a.last_name?.[0]}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">{a.first_name} {a.last_name}</p>
                        <p className="text-xs text-slate-400">Line Manager</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

      </div>
    </AppShell>
  )
}
