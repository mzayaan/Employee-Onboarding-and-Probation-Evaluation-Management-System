// =============================================================================
// src/pages/manager/ManagerTasksPage.jsx
// Line Manager — assign and monitor onboarding tasks for team members.
// Kanban layout (To Do / In Progress / Completed) — same design language
// as HR TaskManagementPage (Figma 12:28).
// FR-07, FR-08 | NFR-03 | Objective 1 | LINE_MANAGER
//
// Uses getMyTeam() for employee dropdown (manager sees only their team).
// Managers cannot delete assignments — backend restricts delete to HR_ADMIN.
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getAllAssignments, assignTask } from '@/api/taskApi'
import { getMyTeam } from '@/api/evaluationApi'
import {
  ClipboardList, Plus, Loader2, AlertCircle,
  CheckCircle, Clock, AlertTriangle, X, Users,
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

// ── Assign Task Modal ─────────────────────────────────────────────────────────
function AssignTaskModal({ teamMembers, onClose, onSaved }) {
  const [form, setForm] = useState({
    profile_id: '', title: '', description: '', priority: 'MEDIUM', due_date: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.profile_id || !form.title.trim() || !form.due_date) {
      setError('Team member, title and due date are required.')
      return
    }
    setSubmitting(true); setError('')
    try {
      await assignTask({ ...form, profile_id: Number(form.profile_id) })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign task.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-800">Assign Task to Team Member</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Team member dropdown */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Team Member <span className="text-red-500">*</span>
            </label>
            {teamMembers.length === 0 ? (
              <p className="text-xs text-slate-400">No team members assigned yet.</p>
            ) : (
              <select
                value={form.profile_id}
                onChange={set('profile_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— Select team member —</option>
                {teamMembers.map((m) => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {m.user?.first_name} {m.user?.last_name} — {m.job_title || 'No title'}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Shadow team lead for daily stand-up"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={set('description')}
              placeholder="Optional details…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={set('priority')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Due Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.due_date}
                onChange={set('due_date')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || teamMembers.length === 0}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {submitting ? 'Assigning…' : 'Assign Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Kanban Card (no delete — managers cannot remove assignments) ───────────────
function TaskCard({ assignment }) {
  const emp         = assignment.employeeProfile
  const priorityCfg = PRIORITY_CONFIG[assignment.task?.priority] || PRIORITY_CONFIG.MEDIUM
  const overdue     = isOverdue(assignment.due_date, assignment.status)

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      {/* Priority badge */}
      <div className="mb-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: priorityCfg.bg, color: priorityCfg.color }}
        >
          {priorityCfg.label}
        </span>
      </div>

      {/* Task title */}
      <p className="text-sm font-semibold text-slate-800 leading-tight mb-1">
        {assignment.task?.title}
      </p>
      {assignment.task?.description && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2">{assignment.task.description}</p>
      )}

      {/* Team member */}
      <div className="flex items-center gap-2 mt-2">
        <div
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          {emp?.user?.first_name?.[0]}{emp?.user?.last_name?.[0]}
        </div>
        <p className="text-xs text-slate-600 truncate">
          {emp?.user?.first_name} {emp?.user?.last_name}
        </p>
      </div>

      {/* Due date */}
      <div className="mt-2 pt-2 border-t border-slate-100">
        <p className={`text-xs font-medium ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
          Due: {formatDate(assignment.due_date)}{overdue && ' — Overdue'}
        </p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ManagerTasksPage() {
  const [assignments,  setAssignments]  = useState([])
  const [teamMembers,  setTeamMembers]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [showModal,    setShowModal]    = useState(false)

  const fetchData = () => {
    setLoading(true)
    Promise.all([getAllAssignments(), getMyTeam()])
      .then(([tasks, team]) => {
        setAssignments(tasks)
        setTeamMembers(team)
      })
      .catch(() => setError('Failed to load tasks.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const total     = assignments.length
  const completed = assignments.filter((a) => a.status === 'COMPLETED').length
  const overdue   = assignments.filter((a) => isOverdue(a.due_date, a.status)).length
  const pending   = assignments.filter((a) => a.status === 'TODO').length

  return (
    <AppShell>
      {showModal && (
        <AssignTaskModal
          teamMembers={teamMembers}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchData() }}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Team Tasks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Assign and monitor onboarding tasks for your team members.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <Plus className="h-4 w-4" /> Assign Task
        </button>
      </div>

      {/* Summary chips */}
      <div className="mb-6 flex flex-wrap gap-3">
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
            const cards   = assignments.filter((a) => a.status === col.key)
            return (
              <div
                key={col.key}
                className="flex flex-col rounded-xl bg-slate-50 ring-1 ring-slate-200 overflow-hidden"
              >
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ backgroundColor: col.headerBg }}
                >
                  <div className="flex items-center gap-2">
                    <ColIcon className="h-4 w-4" style={{ color: col.headerColor }} />
                    <p className="text-sm font-semibold" style={{ color: col.headerColor }}>
                      {col.label}
                    </p>
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
                    cards.map((a) => (
                      <TaskCard key={a.assignment_id} assignment={a} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state when no team members yet */}
      {!loading && !error && assignments.length === 0 && teamMembers.length === 0 && (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl bg-white py-16 text-center shadow-sm ring-1 ring-slate-200">
          <Users className="mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No team members assigned yet.</p>
          <p className="mt-1 text-xs text-slate-400">Tasks can be assigned once HR links employees to your team.</p>
        </div>
      )}
    </AppShell>
  )
}
