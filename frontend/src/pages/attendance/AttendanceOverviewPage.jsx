// =============================================================================
// src/pages/attendance/AttendanceOverviewPage.jsx
// Landing page for the Attendance nav entry.
// LINE_MANAGER: lists their team members with a link to each period's log.
// HR_ADMIN:     lists all employees currently on probation.
// FR-12 | NFR-03
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getMyTeam } from '@/api/evaluationApi'
import { getEmployees } from '@/api/employeeApi'
import { CalendarDays, Loader2, AlertCircle, ChevronRight } from 'lucide-react'

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AttendanceOverviewPage() {
  const { user }  = useAuth()
  const navigate  = useNavigate()

  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    setLoading(true)
    if (user?.role === 'LINE_MANAGER') {
      getMyTeam()
        .then((profiles) => {
          // Each profile may have probationPeriods[]
          const rows = profiles
            .filter((p) => p.probationPeriods?.length > 0)
            .map((p) => ({
              name:      `${p.user?.first_name} ${p.user?.last_name}`,
              jobTitle:  p.job_title || '—',
              periodId:  p.probationPeriods[0]?.period_id,
              startDate: p.probationPeriods[0]?.start_date,
              endDate:   p.probationPeriods[0]?.end_date,
            }))
          setRows(rows)
        })
        .catch(() => setError('Failed to load team data.'))
        .finally(() => setLoading(false))
    } else {
      // HR_ADMIN: fetch all employees and filter those with an active period
      getEmployees()
        .then((employees) => {
          const rows = (employees || [])
            .filter((e) => e.probationPeriods?.length > 0 || e.probationPeriod)
            .map((e) => {
              const period = e.probationPeriod || e.probationPeriods?.[0]
              return {
                name:      `${e.user?.first_name || e.first_name} ${e.user?.last_name || e.last_name}`,
                jobTitle:  e.job_title || '—',
                periodId:  period?.period_id,
                startDate: period?.start_date,
                endDate:   period?.end_date,
              }
            })
            .filter((r) => r.periodId)
          setRows(rows)
        })
        .catch(() => setError('Failed to load employee data.'))
        .finally(() => setLoading(false))
    }
  }, [user?.role])

  return (
    <AppShell>
      <div className="mb-6 flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: '#e8f0fb' }}
        >
          <CalendarDays className="h-5 w-5" style={{ color: '#1e3a5f' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            Attendance
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Select an employee to view or add attendance records for their probation period.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
          <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">No employees are currently on probation.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Employee</th>
                <th className="px-6 py-3 text-left">Job Title</th>
                <th className="px-6 py-3 text-left">Probation Period</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  onClick={() =>
                    r.periodId &&
                    navigate(`/attendance/period/${r.periodId}`, {
                      state: { employeeName: r.name },
                    })
                  }
                >
                  <td className="px-6 py-4 font-medium text-slate-800">{r.name}</td>
                  <td className="px-6 py-4 text-slate-500">{r.jobTitle}</td>
                  <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                    {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                      View Log <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
