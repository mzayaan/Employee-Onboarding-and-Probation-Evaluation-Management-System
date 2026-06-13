// =============================================================================
// src/pages/hr/employees/EmployeeDetailPage.jsx
// HR views and edits a single employee profile.
// FR-04 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { getEmployee, updateEmployeeProfile, getDepartments, getManagers } from '@/api/employeeApi'
import { ArrowLeft, Loader2, Save, AlertCircle } from 'lucide-react'

const FIELD = ({ label, children }) => (
  <div>
    <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
    {children}
  </div>
)

const INFO = ({ label, value }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
    <p className="mt-0.5 text-sm text-slate-800">{value || <span className="text-slate-300">—</span>}</p>
  </div>
)

export default function EmployeeDetailPage() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [employee,    setEmployee]    = useState(null)
  const [departments, setDepartments] = useState([])
  const [managers,    setManagers]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)
  const [saveError,   setSaveError]   = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [form, setForm] = useState({
    job_title:          '',
    department_id:      '',
    manager_id:         '',
    phone:              '',
    start_date:         '',
    probation_end_date: '',
    onboarding_status:  '',
  })

  useEffect(() => {
    Promise.all([getEmployee(id), getDepartments(), getManagers()])
      .then(([emp, depts, mgrs]) => {
        setEmployee(emp)
        setDepartments(depts)
        setManagers(mgrs)
        setForm({
          job_title:          emp.job_title         ?? '',
          department_id:      emp.department_id      ?? '',
          manager_id:         emp.manager_id         ?? '',
          phone:              emp.phone              ?? '',
          start_date:         emp.start_date         ?? '',
          probation_end_date: emp.probation_end_date ?? '',
          onboarding_status:  emp.onboarding_status  ?? 'IN_PROGRESS',
        })
      })
      .catch(() => setError('Failed to load employee details.'))
      .finally(() => setLoading(false))
  }, [id])

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError('')
    setSaveSuccess(false)
    setSaving(true)
    try {
      const payload = {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        manager_id:    form.manager_id    ? Number(form.manager_id)    : null,
      }
      await updateEmployeeProfile(id, payload)
      setSaveSuccess(true)
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

  const u = employee.user ?? {}

  return (
    <AppShell>
      {/* Back */}
      <button
        onClick={() => navigate('/hr/employees')}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Employees
      </button>

      {/* Header card */}
      <div className="mb-6 flex items-center gap-4 rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200">
        <div
          className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          {u.first_name?.[0]}{u.last_name?.[0]}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: '#0f1c2e' }}>
            {u.first_name} {u.last_name}
          </h1>
          <p className="text-sm text-slate-500">{u.email}</p>
        </div>
        <div className="text-right">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-medium"
            style={u.is_active
              ? { backgroundColor: '#dcfce7', color: '#15803d' }
              : { backgroundColor: '#fee2e2', color: '#b91c1c' }}
          >
            {u.is_active ? 'Active' : 'Inactive'}
          </span>
          <p className="mt-1 text-xs text-slate-400">
            {u.role?.replace('_', ' ')}
          </p>
        </div>
      </div>

      {/* Read-only account info */}
      <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Account Information</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <INFO label="First Name"   value={u.first_name} />
          <INFO label="Last Name"    value={u.last_name} />
          <INFO label="Email"        value={u.email} />
          <INFO label="Role"         value={u.role?.replace('_', ' ')} />
          <INFO label="Last Login"   value={u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'} />
          <INFO label="Account Created" value={u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} />
        </div>
      </section>

      {/* Editable profile */}
      <form onSubmit={handleSave}>
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Employment Profile</h2>

          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</div>
          )}
          {saveSuccess && (
            <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
              Profile updated successfully.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="Job Title">
              <input
                type="text"
                value={form.job_title}
                onChange={set('job_title')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Department">
              <select
                value={form.department_id}
                onChange={set('department_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— No department —</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </FIELD>
            <FIELD label="Reporting Manager">
              <select
                value={form.manager_id}
                onChange={set('manager_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— No manager —</option>
                {managers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.first_name} {m.last_name}
                  </option>
                ))}
              </select>
            </FIELD>
            <FIELD label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Start Date">
              <input
                type="date"
                value={form.start_date}
                onChange={set('start_date')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Probation End Date">
              <input
                type="date"
                value={form.probation_end_date}
                onChange={set('probation_end_date')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Onboarding Status">
              <select
                value={form.onboarding_status}
                onChange={set('onboarding_status')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </FIELD>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 transition hover:opacity-90"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/hr/employees')}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  )
}
