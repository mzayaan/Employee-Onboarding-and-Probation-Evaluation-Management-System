// =============================================================================
// src/pages/employee/training/MyTrainingPage.jsx
// New Employee — My Training Records
//
// Displays the authenticated employee's own completed HRDC training entries.
// Shows course name, provider, duration and completion date.
// Cost is intentionally NOT displayed per spec s.4.3 (cost is HR-only data).
//
// Spec s.4.3 | Objective 1 (extended) | FR-NEW-01 | NFR-03
// =============================================================================

import { useState, useEffect } from 'react'
import { GraduationCap, BookOpen, CalendarDays, Clock } from 'lucide-react'
import { getMyTrainingLogs } from '@/api/hrdcApi'
import AppShell from '@/components/shared/AppShell'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-MU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export default function MyTrainingPage() {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await getMyTrainingLogs()
        setLogs(data || [])
      } catch (e) {
        setError(e?.response?.data?.message || 'Failed to load training records.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  return (
    <AppShell>
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Training Records</h1>
        <p className="mt-1 text-sm text-slate-500">
          Completed training courses recorded on your behalf by HR.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Training log */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100 text-slate-800 font-semibold">
          <GraduationCap className="h-5 w-5 text-indigo-500" />
          Completed Training
          {!loading && logs.length > 0 && (
            <span className="ml-auto text-xs font-normal text-slate-400">
              {logs.length} {logs.length === 1 ? 'record' : 'records'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="px-6 py-10 text-sm text-slate-400">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <BookOpen className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-medium text-slate-500">No training records found.</p>
            <p className="text-xs text-slate-400">
              Completed training is added by HR after each course. Check back later.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => (
              <div
                key={log.training_id}
                className="px-6 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  {/* Course name + provider */}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{log.course_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{log.training_provider}</p>
                  </div>

                  {/* Meta chips */}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 sm:text-right">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {log.duration_hours}{' '}
                      {Number(log.duration_hours) === 1 ? 'hour' : 'hours'}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {fmtDate(log.completed_date)}
                    </span>
                  </div>
                </div>

                {/* Optional approved course code badge */}
                {log.hrdc_approved_course_code && (
                  <span className="mt-2 inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
                    HRDC Code: {log.hrdc_approved_course_code}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  </AppShell>
  )
}
