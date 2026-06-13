// =============================================================================
// src/pages/hr/employees/EmployeeDetailPage.jsx
// HR views a single employee profile. Matches Figma 12:26.
// Back nav + Generate PDF + Edit Profile + ProfileHdr + Personal Information.
// FR-04, FR-16 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getEmployee, updateEmployeeProfile, getDepartments, getManagers } from '@/api/employeeApi'
import { ArrowLeft, Loader2, Save, AlertCircle, FileDown, Edit2, X } from 'lucide-react'

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value || <span className="text-slate-300">—</span>}</p>
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
              {employee.department?.name && (
                <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-700">
                  {employee.department.name}
                </span>
              )}
              <span
                className="rounded-full px-3 py-0.5 text-xs font-medium"
                style={{ backgroundColor: u.is_active ? '#dcfce7' : '#fee2e2', color: u.is_active ? '#15803d' : '#b91c1c' }}
              >
                {u.is_active ? 'Active' : 'Inactive'}
              </span>
              <span className="rounded-full px-3 py-0.5 text-xs font-medium" style={{ backgroundColor: onbBadge.bg, color: onbBadge.color }}>
                {onbBadge.label}
              </span>
            </div>
          </div>
        </div>

        {/* Probation progress bar */}
        {employee.start_date && employee.probation_end_date && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-600">Probation Progress</p>
              <p className="text-xs font-semibold" style={{ color: '#1e3a5f' }}>{probPct}%</p>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${probPct}%`, backgroundColor: '#1e3a5f' }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-slate-400">
              <span>Start: {formatDate(employee.start_date)}</span>
              <span>End: {formatDate(employee.probation_end_date)}</span>
            </div>
          </div>
        )}
      </div>

      {saveSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Profile updated successfully.
        </div>
      )}

      {/* Personal Information (read-only view) */}
      {(!editing || isManager) ? (
        <div className="rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Personal Information</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <InfoField label="First Name"        value={u.first_name} />
            <InfoField label="Last Name"         value={u.last_name} />
            <InfoField label="Email"             value={u.email} />
            <InfoField label="Job Title"         value={employee.job_title} />
            <InfoField label="Department"        value={employee.department?.name} />
            <InfoField label="Phone"             value={employee.phone} />
            <InfoField label="Start Date"        value={formatDate(employee.start_date)} />
            <InfoField label="Probation End"     value={formatDate(employee.probation_end_date)} />
            <InfoField label="Reporting Manager" value={
              employee.manager
                ? `${employee.manager.first_name} ${employee.manager.last_name}`
                : undefined
            } />
            <InfoField label="Role"              value={u.role?.replace('_', ' ')} />
            <InfoField label="Last Login"        value={u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'} />
            <InfoField label="Account Created"   value={u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} />
          </div>
        </div>
      ) : (
        /* Edit form */
        <form onSubmit={handleSave} className="rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Edit Employment Profile</h2>

          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: 'Job Title',   field: 'job_title',   type: 'text' },
              { label: 'Phone',       field: 'phone',       type: 'tel'  },
              { label: 'Start Date',  field: 'start_date',  type: 'date' },
              { label: 'Probation End Date', field: 'probation_end_date', type: 'date' },
            ].map(({ label, field, type }) => (
              <div key={field}>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
                <input
                  type={type}
                  value={form[field]}
                  onChange={set(field)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            ))}

            {/* Department */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Department</label>
              <select value={form.department_id} onChange={set('department_id')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— No department —</option>
                {departments.map((d) => <option key={d.department_id} value={d.department_id}>{d.name}</option>)}
              </select>
            </div>

            {/* Manager */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Reporting Manager</label>
              <select value={form.manager_id} onChange={set('manager_id')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— No manager —</option>
                {managers.map((m) => <option key={m.user_id} value={m.user_id}>{m.first_name} {m.last_name}</option>)}
              </select>
            </div>

            {/* Onboarding status */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Onboarding Status</label>
              <select value={form.onboarding_status} onChange={set('onboarding_status')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: '#1e3a5f' }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      )}
    </AppShell>
  )
}
