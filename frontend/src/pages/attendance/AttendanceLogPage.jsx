// =============================================================================
// src/pages/attendance/AttendanceLogPage.jsx
// Attendance log — HR Admin and Line Manager can add and view daily attendance
// records for an employee's probation period.
//
// Route: /attendance/period/:periodId
// Router state (optional): { employeeName, checkpointLabel, fromDate, toDate }
// FR-12 | NFR-02, NFR-03 | Objective 2
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { addAttendanceRecord, getAttendanceByPeriod } from '@/api/attendanceApi'
import {
  CalendarDays, ChevronLeft, Loader2, AlertCircle,
  CheckCircle2, Plus, ClipboardList,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_OPTIONS = [
  { value: 'PRESENT',  label: 'Present',   colour: 'bg-emerald-100 text-emerald-700' },
  { value: 'ABSENT',   label: 'Absent',    colour: 'bg-red-100    text-red-700'      },
  { value: 'LATE',     label: 'Late',      colour: 'bg-amber-100  text-amber-700'    },
  { value: 'HALF_DAY', label: 'Half Day',  colour: 'bg-blue-100   text-blue-700'     },
]

function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0]
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${opt.colour}`}>
      {opt.label}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendanceLogPage() {
  const { periodId } = useParams()
  const navigate     = useNavigate()
  const location     = useLocation()

  // Optional context passed via router state from EvaluationFormPage / MyTeamPage
  const routeState = location.state || {}
  const {
    employeeName   = '',
    checkpointLabel = '',
    fromDate: contextFrom = null,
    toDate:   contextTo   = null,
  } = routeState

  // ── Data ──────────────────────────────────────────────────────────────────
  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)

  // ── Form ──────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    record_date: today,
    status:      'PRESENT',
    notes:       '',
  })
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState(null)
  const [formOk,   setFormOk]   = useState(false)

  const fetchRecords = () => {
    setLoading(true)
    setLoadErr(null)
    getAttendanceByPeriod(periodId)
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => setLoadErr('Failed to load attendance records.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (periodId) fetchRecords()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId])

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFormErr(null)
    setFormOk(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.record_date) { setFormErr('Please select a date.'); return }
    if (!form.status)      { setFormErr('Please select a status.'); return }

    setSaving(true)
    setFormErr(null)
    setFormOk(false)
    try {
      await addAttendanceRecord({
        period_id:   parseInt(periodId, 10),
        record_date: form.record_date,
        status:      form.status,
        notes:       form.notes.trim() || undefined,
      })
      setFormOk(true)
      setForm({ record_date: today, status: 'PRESENT', notes: '' })
      fetchRecords()
    } catch (err) {
      setFormErr(err?.response?.data?.message || 'Failed to save attendance record.')
    } finally {
      setSaving(false)
    }
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  const summary = records.reduce(
    (acc, r) => {
      if (r.status === 'PRESENT')  acc.present++
      if (r.status === 'ABSENT')   acc.absent++
      if (r.status === 'LATE')     acc.late++
      if (r.status === 'HALF_DAY') acc.halfDay++
      return acc
    },
    { present: 0, absent: 0, late: 0, halfDay: 0 }
  )

  return (
    <AppShell>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: '#e8f0fb' }}
        >
          <CalendarDays className="h-5 w-5" style={{ color: '#1e3a5f' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            Attendance Log
          </h1>
          {(employeeName || checkpointLabel) && (
            <p className="mt-0.5 text-sm text-slate-500">
              {employeeName && <span className="font-medium text-slate-700">{employeeName}</span>}
              {employeeName && checkpointLabel && ' · '}
              {checkpointLabel}
              {(contextFrom || contextTo) && (
                <span className="ml-2 text-slate-400">
                  ({fmtDate(contextFrom)} – {fmtDate(contextTo)})
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ── LEFT: Add form + records list ──────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Add record form */}
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-800">
              <Plus className="h-4 w-4 text-slate-400" /> Add Attendance Record
            </h2>

            {formOk && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700 ring-1 ring-green-200">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                Record saved successfully.
              </div>
            )}
            {formErr && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {formErr}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Date */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.record_date}
                    max={today}
                    onChange={(e) => handleChange('record_date', e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-700">
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-700">
                  Notes <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="e.g. Medical appointment, traffic delay…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>

          {/* Records table */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
              <ClipboardList className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-slate-800">
                Attendance Records
                {records.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    ({records.length})
                  </span>
                )}
              </h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : loadErr ? (
              <div className="flex items-center gap-2 px-6 py-4 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" /> {loadErr}
              </div>
            ) : records.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-400">
                No attendance records yet. Add the first one above.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Notes</th>
                    <th className="px-6 py-3 text-left">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.record_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-700 whitespace-nowrap">
                        {fmtDate(r.record_date)}
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-6 py-3 text-slate-500 max-w-xs truncate">
                        {r.notes || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                        {r.recorder
                          ? `${r.recorder.first_name} ${r.recorder.last_name}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── RIGHT: Summary card ────────────────────────────────────────── */}
        <div>
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 font-semibold text-slate-800">Period Summary</h2>
            <div className="space-y-3">
              {[
                { label: 'Days Present',  value: summary.present,  colour: 'text-emerald-600', bg: 'bg-emerald-50'  },
                { label: 'Days Absent',   value: summary.absent,   colour: 'text-red-600',     bg: 'bg-red-50'      },
                { label: 'Late Arrivals', value: summary.late,     colour: 'text-amber-600',   bg: 'bg-amber-50'    },
                { label: 'Half Days',     value: summary.halfDay,  colour: 'text-blue-600',    bg: 'bg-blue-50'     },
              ].map(({ label, value, colour, bg }) => (
                <div key={label} className={`flex items-center justify-between rounded-lg px-4 py-3 ${bg}`}>
                  <span className="text-sm text-slate-600">{label}</span>
                  <span className={`text-xl font-bold ${colour}`}>{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Total Records</span>
                <span className="text-xl font-bold text-slate-800">{records.length}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              These counts are automatically used to pre-fill the attendance section of the probation evaluation form.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
