// =============================================================================
// src/pages/employee/tasks/MyTasksPage.jsx
// Employee views their onboarding tasks and updates status.
// Kanban layout matching HR/Manager task pages.
// FR-08 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getMyTasks, updateTaskStatus } from '@/api/taskApi'
import {
  ClipboardList, CheckCircle, Clock, AlertTriangle,
  Loader2, AlertCircle,
} from 'lucide-react'

const PRIORITY_CONFIG = {
  LOW:    { label: 'Low',    bg: '#f1f5f9', color: '#475569' },
  MEDIUM: { label: 'Medium', bg: '#fef3c7', color: '#b45309' },
  HIGH:   { label: 'High',   bg: '#fee2e2', color: '#b91c1c' },
}

const COLUMNS = [
  { key: 'TODO',        label: 'To Do',       icon: Clock,         headerBg: '#f1f5f9', headerColor: '#475569', dot: '#94a3b8' },
  { key: 'IN_PROGRESS', label: 'In Progress', icon: AlertTriangle, headerBg: '#fef3c7', headerColor: '#b45309', dot: '#f59e0b' },
  { key: 'COMPLETED',   label: 'Completed',   icon: CheckCircle,   headerBg: '#dcfce7', headerColor: '#15803d', dot: '#16a34a' },
]

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(dueDate, status) {
  return status !== 'COMPLETED' && new Date(dueDate) < new Date()
}

// ── Kanban Card ───────────────────────────────────────────────────────────────
function TaskCard({ assignment, onStatusChange, updating }) {
  const priorityCfg = PRIORITY_CONFIG[assignment.task?.priority] || PRIORITY_CONFIG.MEDIUM
  const overdue     = isOverdue(assignment.due_date, assignment.status)
  const isUpdating  = updating === assignment.assignment_id

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      {/* Priority badge */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: priorityCfg.bg, color: priorityCfg.color }}
        >
          {priorityCfg.label}
        </span>
        {assignment.completed_at && (
          <span className="text-xs text-slate-400">{formatDate(assignment.completed_at)}</span>
        )}
      </div>

      {/* Task title */}
      <p className="text-sm font-semibold text-slate-800 leading-tight mb-1">
        {assignment.task?.title}
      </p>
      {assignment.task?.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{assignment.task.description}</p>
      )}

      {/* Assigned by */}
      {assignment.assigner && (
        <div className="flex items-center gap-2 mt-2">
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {assignment.assigner.first_name?.[0]}{assignment.assigner.last_name?.[0]}
          </div>
          <p className="text-xs text-slate-500 truncate">
            {assignment.assigner.first_name} {assignment.assigner.last_name}
          </p>
        </div>
      )}

      {/* Due date + action buttons */}
      <div className="mt-2 pt-2 border-t border-slate-100">
        <p className={`text-xs font-medium mb-2 ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
          Due: {formatDate(assignment.due_date)}{overdue && ' — Overdue'}
        </p>

        {assignment.status !== 'COMPLETED' && (
          <div className="flex gap-1.5">
            {assignment.status === 'TODO' && (
              <button
                onClick={() => onStatusChange(assignment.assignment_id, 'IN_PROGRESS')}
                disabled={isUpdating}
                className="flex-1 rounded-lg border border-amber-200 bg-amber-50 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {isUpdating ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Start'}
              </button>
            )}
            <button
              onClick={() => onStatusChange(assignment.assignment_id, 'COMPLETED')}
              disabled={isUpdating}
              className="flex-1 rounded-lg border border-green-200 bg-green-50 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
            >
              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Complete'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MyTasksPage() {
  const [tasks,    setTasks]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [updating, setUpdating] = useState(null)

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
  const pending   = tasks.filter((t) => t.status === 'TODO').length

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>My Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Complete your onboarding tasks to finish the onboarding process.
        </p>
      </div>

      {/* Summary chips */}
      <div className="mb-6 flex gap-3">
        {[
          { label: 'Total',     value: total,     color: '#1e3a5f', bg: '#e8edf5' },
          { label: 'To Do',     value: pending,   color: '#475569', bg: '#f1f5f9' },
          { label: 'Completed', value: completed, color: '#15803d', bg: '#dcfce7' },
          { label: 'Overdue',   value: overdue,   color: '#b91c1c', bg: '#fee2e2' },
        ].map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium"
            style={{ backgroundColor: s.bg, color: s.color }}
          >
            <span className="text-base font-bold">{loading ? '—' : s.value}</span>
            {s.label}
          </div>
        ))}
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {COLUMNS.map((col) => {
            const ColIcon = col.icon
            const cards   = tasks.filter((t) => t.status === col.key)
            return (
              <div key={col.key} className="flex flex-col rounded-xl bg-slate-50 ring-1 ring-slate-200 overflow-hidden">
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ backgroundColor: col.headerBg }}
                >
                  <div className="flex items-center gap-2">
                    <ColIcon className="h-4 w-4" style={{ color: col.headerColor }} />
                    <p className="text-sm font-semibold" style={{ color: col.headerColor }}>{col.label}</p>
                  </div>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: col.dot + '30', color: col.headerColor }}
                  >
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-3 p-3 min-h-[300px]">
                  {cards.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-300">
                      <ClipboardList className="h-8 w-8 mb-2" />
                      No tasks
                    </div>
                  ) : (
                    cards.map((t) => (
                      <TaskCard
                        key={t.assignment_id}
                        assignment={t}
                        onStatusChange={handleStatusChange}
                        updating={updating}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
