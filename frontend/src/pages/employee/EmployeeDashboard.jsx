// =============================================================================
// src/pages/employee/EmployeeDashboard.jsx
// New Employee dashboard — live onboarding progress summary.
// FR-08 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { FileText, ClipboardList, BarChart3, CalendarClock, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react'
import { getMyProgress } from '@/api/dashboardApi'
import { getMyDocuments } from '@/api/documentApi'
import { getMyTasks } from '@/api/taskApi'

// Circular progress ring (SVG)
function ProgressRing({ value }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const stroke = circ - (value / 100) * circ
  const colour = value >= 80 ? '#16a34a' : value >= 40 ? '#f59e0b' : '#3d7dd3'
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg className="-rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f1f5f9" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r}
          fill="none"
          stroke={colour}
          strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={stroke}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute text-sm font-bold" style={{ color: colour }}>{value}%</span>
    </div>
  )
}

export default function EmployeeDashboard() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [progress, setProgress] = useState(null)
  const [docs,     setDocs]     = useState([])
  const [tasks,    setTasks]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    Promise.all([getMyProgress(), getMyDocuments(), getMyTasks()])
      .then(([prog, docList, taskList]) => {
        setProgress(prog)
        setDocs(docList)
        setTasks(taskList)
      })
      .catch(() => setError('Failed to load your dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  const submitted = progress?.submitted_docs      ?? '—'
  const approved  = progress?.approved_docs       ?? '—'
  const completed = progress?.completed_tasks     ?? '—'
  const total     = progress?.total_tasks         ?? '—'
  const pct       = progress?.task_progress       ?? 0
  const daysLeft  = progress?.probation_days_left
  const probStat  = progress?.probation_status

  const DOC_STATUS = {
    PENDING:  { label: 'Pending',  icon: Clock,         color: '#b45309', bg: '#fef3c7' },
    APPROVED: { label: 'Approved', icon: CheckCircle,   color: '#15803d', bg: '#dcfce7' },
    REJECTED: { label: 'Rejected', icon: XCircle,       color: '#b91c1c', bg: '#fee2e2' },
  }
  const TASK_STATUS = {
    TODO:        { label: 'To Do',       icon: Clock,         color: '#475569' },
    IN_PROGRESS: { label: 'In Progress', icon: AlertTriangle, color: '#b45309' },
    COMPLETED:   { label: 'Completed',   icon: CheckCircle,   color: '#15803d' },
  }

  return (
    <AppShell>
      {/* Welcome banner with progress ring */}
      <div className="mb-6 flex items-center justify-between rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            Welcome, {user?.first_name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Your onboarding hub — track documents, tasks, and probation progress
          </p>
        </div>
        <div className="flex-shrink-0">
          {loading
            ? <div className="h-20 w-20 rounded-full bg-slate-100 animate-pulse" />
            : <ProgressRing value={pct} />}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* 4 Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-6">
        {/* Documents */}
        <div className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
               style={{ backgroundColor: '#1e3a5f18' }}>
            <FileText className="h-5 w-5" style={{ color: '#1e3a5f' }} />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
              {loading ? <span className="animate-pulse text-slate-300">—</span> : submitted}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Documents Submitted</p>
          </div>
        </div>

        {/* Tasks */}
        <div className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
               style={{ backgroundColor: '#16a34a18' }}>
            <ClipboardList className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
              {loading ? <span className="animate-pulse text-slate-300">—</span> : `${completed}/${total}`}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Tasks Completed</p>
          </div>
        </div>

        {/* Evaluations */}
        <div className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
               style={{ backgroundColor: '#7c3aed18' }}>
            <BarChart3 className="h-5 w-5" style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>0</p>
            <p className="text-xs text-slate-500 mt-0.5">Evaluations</p>
          </div>
        </div>

        {/* Probation */}
        <div className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
               style={{ backgroundColor: '#3d7dd318' }}>
            <CalendarClock className="h-5 w-5" style={{ color: '#3d7dd3' }} />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
              {loading
                ? <span className="animate-pulse text-slate-300">—</span>
                : daysLeft !== null && daysLeft !== undefined
                  ? daysLeft > 0 ? `${daysLeft}d` : 'Ended'
                  : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Probation Days Left</p>
          </div>
        </div>
      </div>

      {/* Bottom two-column: My Documents + My Tasks */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* My Documents */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">My Documents</h2>
            <button
              onClick={() => navigate('/employee/documents')}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="px-5 py-8 text-center text-xs text-slate-400 animate-pulse">Loading…</div>
            ) : docs.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-400">No documents submitted yet.</div>
            ) : (
              docs.slice(0, 5).map((doc) => {
                const cfg = DOC_STATUS[doc.status] || DOC_STATUS.PENDING
                const Icon = cfg.icon
                return (
                  <div key={doc.document_id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      <p className="text-xs font-medium text-slate-700 truncate">
                        {doc.documentType?.name ?? 'Document'}
                      </p>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}
                    >
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </div>
                )
              })
            )}
          </div>
          {docs.length > 5 && (
            <div className="border-t border-slate-100 px-5 py-2.5">
              <button onClick={() => navigate('/employee/documents')} className="text-xs text-blue-600 hover:underline">
                +{docs.length - 5} more documents
              </button>
            </div>
          )}
        </div>

        {/* My Tasks */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">My Tasks</h2>
            <button
              onClick={() => navigate('/employee/tasks')}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="px-5 py-8 text-center text-xs text-slate-400 animate-pulse">Loading…</div>
            ) : tasks.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-slate-400">No tasks assigned yet.</div>
            ) : (
              tasks.slice(0, 5).map((t) => {
                const cfg = TASK_STATUS[t.status] || TASK_STATUS.TODO
                const Icon = cfg.icon
                const overdue = t.status !== 'COMPLETED' && new Date(t.due_date) < new Date()
                return (
                  <div key={t.assignment_id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 flex-shrink-0" style={{ color: cfg.color }} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{t.task?.title}</p>
                        {overdue && <p className="text-xs text-red-500">Overdue</p>}
                      </div>
                    </div>
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })
            )}
          </div>
          {tasks.length > 5 && (
            <div className="border-t border-slate-100 px-5 py-2.5">
              <button onClick={() => navigate('/employee/tasks')} className="text-xs text-blue-600 hover:underline">
                +{tasks.length - 5} more tasks
              </button>
            </div>
          )}
        </div>

      </div>
    </AppShell>
  )
}
