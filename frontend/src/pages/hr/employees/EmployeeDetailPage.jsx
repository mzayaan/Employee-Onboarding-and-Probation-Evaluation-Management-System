// =============================================================================
// src/pages/hr/employees/EmployeeDetailPage.jsx
// HR views a single employee profile. Matches Figma 12:26.
// Back nav + Generate PDF + Edit Profile + ProfileHdr + Personal Information.
// FR-04, FR-12, FR-16 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getEmployee, updateEmployeeProfile, getDepartments, getManagers } from '@/api/employeeApi'
import { addAttendanceRecord, getAttendanceByPeriod } from '@/api/attendanceApi'
import { getProbationByProfile } from '@/api/evaluationApi'
import { ArrowLeft, Loader2, Save, AlertCircle, FileDown, Edit2, X, ClipboardList, PlusCircle, BarChart3 } from 'lucide-react'

// ── Attendance status display config ──────────────────────────────────────────
const ATTENDANCE_STATUS = {
  PRESENT:  { label: 'Present',  bg: '#dcfce7', color: '#15803d' },
  ABSENT:   { label: 'Absent',   bg: '#fee2e2', color: '#b91c1c' },
  LATE:     { label: 'Late',     bg: '#fef9c3', color: '#854d0e' },
  HALF_DAY: { label: 'Half Day', bg: '#e0e7ff', color: '#3730a3' },
}

// ── Attendance section sub-component (FR-12) ──────────────────────────────────
function AttendanceSection({ periodId }) {
  const [records,    setRecords]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr,    setFormErr]    = useState('')
  const [form, setForm] = useState({ record_date: '', status: 'PRESENT', notes: '' })

  useEffect(() => {
    if (!periodId) { setLoading(false); return }
    getAttendanceByPeriod(periodId)
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [periodId])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.record_date) { setFormErr('Date is required.'); return }
    setSubmitting(true); setFormErr('')
    try {
      await addAttendanceRecord({ period_id: periodId, ...form })
      // Re-fetch so the recorder association (first_name, last_name) is populated
      const updated = await getAttendanceByPeriod(periodId)
      setRecords(updated)
      setForm({ record_date: '', status: 'PRESENT', notes: '' })
      setShowForm(false)
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Failed to save record.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!periodId) return null

  return (
    <div className="rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" style={{ color: '#1e3a5f' }} />
          <h2 className="text-base font-semibold" style={{ color: '#0f1c2e' }}>Attendance Records</h2>
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{records.length}</span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Add Record
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          {formErr && <p className="text-xs text-red-600">{formErr}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date *</label>
              <input
                type="date"
                value={form.record_date}
                onChange={(e) => setForm((f) => ({ ...f, record_date: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Status *</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {Object.entries(ATTENDANCE_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
            <input
              type="text"
              placeholder="Reason for absence, late arrival, etc."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormErr('') }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading attendance records…</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-slate-400">No attendance records yet. Click &ldquo;Add Record&rdquo; to begin.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Notes</th>
                <th className="pb-2">Recorded By</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => {
                const cfg = ATTENDANCE_STATUS[r.status] || ATTENDANCE_STATUS.PRESENT
                return (
                  <tr key={r.record_id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-medium text-slate-700">
                      {new Date(r.record_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">{r.notes || <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5 text-slate-500">
                      {r.recorder ? `${r.recorder.first_name} ${r.recorder.last_name}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value || <span className="text-slate-300">—</span>}</p>
    </div>
  )
}

// ── Probation Checkpoints Section (FR-13, FR-14, FR-16) ──────────────────────
// Shows HR both the manager score and employee self-assessment score per checkpoint.
function ProbationCheckpointsSection({ profileId }) {
  const [period,  setPeriod]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profileId) { setLoading(false); return }
    getProbationByProfile(profileId)
      .then(setPeriod)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profileId])

  if (loading) return (
    <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading evaluation checkpoints…
    </div>
  )

  if (!period || !period.checkpoints?.length) return null

  const scoreColour = (v) =>
    v == null ? '#94a3b8'
    : v >= 75  ? '#15803d'
    : v >= 50  ? '#854d0e'
    : '#b91c1c'

  const scoreBg = (v) =>
    v == null ? '#f1f5f9'
    : v >= 75  ? '#dcfce7'
    : v >= 50  ? '#fef9c3'
    : '#fee2e2'

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-slate-400" />
        <h2 className="font-semibold text-slate-800">Probation Evaluation Checkpoints</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Checkpoint</th>
              <th className="pb-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="pb-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Manager Score</th>
              <th className="pb-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Self-Assessment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {period.checkpoints.map((cp) => {
              const mgr  = cp.managerEvaluation?.weighted_score != null
                ? parseFloat(cp.managerEvaluation.weighted_score) : null
              const self = cp.selfAssessment?.self_score != null
                ? parseFloat(cp.selfAssessment.self_score) : null

              return (
                <tr key={cp.checkpoint_id}>
                  <td className="py-3 text-xs font-medium text-slate-700">{cp.checkpoint_label}</td>
                  <td className="py-3">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{
                        backgroundColor: cp.status === 'COMPLETED' ? '#dcfce7' : cp.status === 'OVERDUE' ? '#fee2e2' : '#f1f5f9',
                        color:            cp.status === 'COMPLETED' ? '#15803d' : cp.status === 'OVERDUE' ? '#b91c1c' : '#64748b',
                      }}
                    >
                      {cp.status}
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    {mgr != null ? (
                      <span
                        className="inline-block rounded-full px-3 py-0.5 text-xs font-bold"
                        style={{ backgroundColor: scoreBg(mgr), color: scoreColour(mgr) }}
                      >
                        {mgr.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Not submitted</span>
                    )}
                  </td>
                  <td className="py-3 text-center">
                    {self != null ? (
                      <span
                        className="inline-block rounded-full px-3 py-0.5 text-xs font-bold"
                        style={{ backgroundColor: scoreBg(self), color: scoreColour(self) }}
                      >
                        {self.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Not submitted</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span><span className="font-semibold text-green-700">≥ 75</span> — Confirm Employment</span>
        <span><span className="font-semibold text-yellow-700">50–74</span> — Extend Probation</span>
        <span><span className="font-semibold text-red-700">&lt; 50</span> — Recommend Dismissal</span>
      </div>
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function probationProgress(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start   = new Date(startDate).getTime()
  const end     = new Date(endDate).getTime()
  const now     = Date.now()
  const total   = end - start
  if (total <= 0) return 100
  const elapsed = Math.min(now - start, total)
  return Math.round((elapsed / total) * 100)
}

const ONBOARDING_BADGE = {
  IN_PROGRESS: { label: 'Onboarding In Progress', bg: '#fef3c7', color: '#b45309' },
  COMPLETED:   { label: 'Onboarding Completed',   bg: '#dcfce7', color: '#15803d' },
}

export default function EmployeeDetailPage() {
  const { id }           = useParams()
  const navigate         = useNavigate()
  const { user: authUser } = useAuth()
  const isManager        = authUser?.role === 'LINE_MANAGER'

  const [employee,    setEmployee]    = useState(null)
  const [departments, setDepartments] = useState([])
  const [managers,    setManagers]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [editing,     setEditing]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [form, setForm] = useState({
    job_title: '', department_id: '', manager_id: '', phone: '',
    start_date: '', probation_end_date: '', onboarding_status: '',
  })

  useEffect(() => {
    // Managers only need the employee record — skip HR-only lookups (departments/managers)
    // to avoid 403 errors that would abort the whole fetch.
    const fetches = isManager
      ? [getEmployee(id)]
      : [getEmployee(id), getDepartments(), getManagers()]

    Promise.all(fetches)
      .then(([emp, depts = [], mgrs = []]) => {
        setEmployee(emp)
        setDepartments(depts)
        setManagers(mgrs)
        setForm({
          job_title:          emp.job_title         ?? '',
          department_id:      emp.department_id      ?? '',
          manager_id:         emp.manager_id         ?? '',
          phone:              emp.phone              ?? '',
          start_date:         emp.start_date         ? emp.start_date.slice(0, 10) : '',
          probation_end_date: emp.probation_end_date ? emp.probation_end_date.slice(0, 10) : '',
          onboarding_status:  emp.onboarding_status  ?? 'IN_PROGRESS',
        })
      })
      .catch(() => setError('Failed to load employee details.'))
      .finally(() => setLoading(false))
  }, [id, isManager])

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError(''); setSaveSuccess(false); setSaving(true)
    try {
      const payload = {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        manager_id:    form.manager_id    ? Number(form.manager_id)    : null,
      }
      await updateEmployeeProfile(id, payload)
      setSaveSuccess(true)
      setEditing(false)
      // Refresh employee data
      const updated = await getEmployee(id)
      setEmployee(updated)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </AppShell>
    )
  }

  if (error || !employee) {
    return (
      <AppShell>
        <div className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error || 'Employee not found.'}
        </div>
      </AppShell>
    )
  }

  const u         = employee.user ?? {}
  const probPct   = probationProgress(employee.start_date, employee.probation_end_date)
  const onbBadge  = ONBOARDING_BADGE[employee.onboarding_status] ?? ONBOARDING_BADGE.IN_PROGRESS

  return (
    <AppShell>
      {/* Top bar: Back + Actions */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(isManager ? '/manager/team' : '/hr/employees')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {isManager ? 'Back to My Team' : 'Back to Employees'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(`http://localhost:5000/api/employees/${id}/report?token=${localStorage.getItem('token')}`, '_blank')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileDown className="h-4 w-4" />
            Generate PDF Report
          </button>
          {/* Edit Profile — HR Admin only; managers have read-only access */}
          {!isManager && (
            <button
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
              {editing ? 'Cancel Edit' : 'Edit Profile'}
            </button>
          )}
        </div>
      </div>

      {/* Profile Header card */}
      <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {u.first_name?.[0]}{u.last_name?.[0]}
          </div>

          {/* Name + tags */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold" style={{ color: '#0f1c2e' }}>
              {u.first_name} {u.last_name}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{u.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {employee.job_title && (
                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-medium text-slate-600">
                  {employee.job_title}
                </span>
              )}
              <span
                className="rounded-full px-3 py-0.5 text-xs font-medium"
                style={{ backgroundColor: onbBadge.bg, color: onbBadge.color }}
              >
                {onbBadge.label}
              </span>
              {!u.is_active && (
                <span className="rounded-full bg-slate-200 px-3 py-0.5 text-xs font-medium text-slate-500">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Probation progress bar */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Probation progress</p>
            <p className="text-xs font-medium text-slate-700">{probPct}%</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${probPct}%`, backgroundColor: probPct >= 100 ? '#16a34a' : '#1e3a5f' }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>{formatDate(employee.start_date)}</span>
            <span>{formatDate(employee.probation_end_date)}</span>
          </div>
        </div>
      </div>

      {/* Save success toast */}
      {saveSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
          Profile updated successfully.
        </div>
      )}

      {/* Read-only view (both roles) or edit form (HR Admin only) */}
      {(!editing || isManager) ? (
        <>
          {/* Personal information card */}
          <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Personal Information</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <InfoField label="Email"          value={u.email} />
              <InfoField label="Phone"          value={employee.phone} />
              <InfoField label="Job Title"      value={employee.job_title} />
              <InfoField label="Department"     value={employee.department?.name} />
              <InfoField
                label="Manager"
                value={employee.manager ? `${employee.manager.first_name} ${employee.manager.last_name}` : null}
              />
              <InfoField label="Role"           value={u.role?.replace(/_/g, ' ')} />
              <InfoField label="Start Date"     value={formatDate(employee.start_date)} />
              <InfoField label="Probation Ends" value={formatDate(employee.probation_end_date)} />
              <InfoField label="Account Status" value={u.is_active ? 'Active' : 'Inactive'} />
              <InfoField label="Last Login"     value={formatDate(u.last_login_at)} />
              <InfoField label="Member Since"   value={formatDate(u.created_at)} />
            </div>
          </div>

          {/* Attendance records — HR Admin and Line Manager (FR-12) */}
          <AttendanceSection
            periodId={(employee.probationPeriods ?? [])[0]?.period_id ?? null}
          />

          {/* Probation checkpoint scores — HR Admin (FR-13, FR-14, FR-16) */}
          <ProbationCheckpointsSection profileId={employee.profile_id} />
        </>
      ) : (
        /* Edit form — HR Admin only */
        <form onSubmit={handleSave} className="rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-5 text-base font-semibold" style={{ color: '#0f1c2e' }}>Edit Profile</h2>

          {saveError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Job Title *</label>
              <input
                type="text"
                value={form.job_title}
                onChange={set('job_title')}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Department</label>
              <select
                value={form.department_id}
                onChange={set('department_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Manager</label>
              <select
                value={form.manager_id}
                onChange={set('manager_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— None —</option>
                {managers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.first_name} {m.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start Date *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={set('start_date')}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Probation End Date *</label>
              <input
                type="date"
                value={form.probation_end_date}
                onChange={set('probation_end_date')}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Onboarding Status</label>
              <select
                value={form.onboarding_status}
                onChange={set('onboarding_status')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setSaveError('') }}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </AppShell>
  )
}
