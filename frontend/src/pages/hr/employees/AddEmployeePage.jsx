// =============================================================================
// src/pages/hr/employees/AddEmployeePage.jsx
// HR creates a new user account + employee profile in one form.
// FR-01, FR-04 | NFR-02, NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate }         from 'react-router-dom'
import AppShell                from '@/components/shared/AppShell'
import { createEmployee, getDepartments, getManagers } from '@/api/employeeApi'
import { ArrowLeft, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'

const ROLES = [
  { value: 'NEW_EMPLOYEE', label: 'New Employee' },
  { value: 'LINE_MANAGER', label: 'Line Manager' },
  { value: 'HR_ADMIN',     label: 'HR Administrator' },
]

const FIELD = ({ label, required, error, children }) => (
  <div>
    <label className="mb-1.5 block text-sm font-medium text-slate-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
)

export default function AddEmployeePage() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    first_name:        '',
    last_name:         '',
    email:             '',
    password:          '',
    role:              'NEW_EMPLOYEE',
    job_title:         '',
    department_id:     '',
    manager_id:        '',
    phone:             '',
    start_date:        '',
    probation_end_date: '',
  })
  const [errors,      setErrors]      = useState({})
  const [showPwd,     setShowPwd]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [departments, setDepartments] = useState([])
  const [managers,    setManagers]    = useState([])
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    Promise.all([getDepartments(), getManagers()])
      .then(([depts, mgrs]) => {
        setDepartments(depts)
        setManagers(mgrs)
      })
      .catch(() => {})
  }, [])

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const validate = () => {
    const e = {}
    if (!form.first_name.trim())  e.first_name  = 'First name is required.'
    if (!form.last_name.trim())   e.last_name   = 'Last name is required.'
    if (!form.email.trim())       e.email       = 'Email is required.'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email.'
    if (!form.password)           e.password    = 'Password is required.'
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters.'
    if (!form.job_title.trim())   e.job_title   = 'Job title is required.'
    if (!form.start_date)         e.start_date  = 'Start date is required.'
    if (!form.probation_end_date) e.probation_end_date = 'Probation end date is required.'
    if (form.start_date && form.probation_end_date) {
      if (new Date(form.probation_end_date) <= new Date(form.start_date)) {
        e.probation_end_date = 'Must be after start date.'
      }
    }
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setErrors({})
    setServerError('')
    setLoading(true)

    try {
      const payload = {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        manager_id:    form.manager_id    ? Number(form.manager_id)    : null,
      }
      await createEmployee(payload)
      setSuccess(true)
    } catch (err) {
      setServerError(err.response?.data?.message || 'Failed to create employee. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-800">Employee Created</h2>
          <p className="mt-2 text-sm text-slate-500">
            {form.first_name} {form.last_name}'s account and profile have been set up successfully.
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate('/hr/employees')}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              View All Employees
            </button>
            <button
              onClick={() => { setSuccess(false); setForm({ first_name: '', last_name: '', email: '', password: '', role: 'NEW_EMPLOYEE', job_title: '', department_id: '', manager_id: '', phone: '', start_date: '', probation_end_date: '' }) }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add Another
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      {/* Back */}
      <button
        onClick={() => navigate('/hr/employees')}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Employees
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Add New Employee</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a user account and employee profile. Fields marked * are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        {/* ── Account Information ──────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Account Information
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="First Name" required error={errors.first_name}>
              <input
                type="text"
                value={form.first_name}
                onChange={set('first_name')}
                placeholder="e.g. John"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Last Name" required error={errors.last_name}>
              <input
                type="text"
                value={form.last_name}
                onChange={set('last_name')}
                placeholder="e.g. Smith"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Email Address" required error={errors.email}>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="e.g. john.smith@company.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Temporary Password" required error={errors.password}>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Min. 8 characters"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </FIELD>
            <FIELD label="System Role" required error={errors.role}>
              <select
                value={form.role}
                onChange={set('role')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </FIELD>
          </div>
        </section>

        {/* ── Employment Details ───────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Employment Details
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="Job Title" required error={errors.job_title}>
              <input
                type="text"
                value={form.job_title}
                onChange={set('job_title')}
                placeholder="e.g. Software Engineer"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Department" error={errors.department_id}>
              <select
                value={form.department_id}
                onChange={set('department_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— Select department —</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </FIELD>
            <FIELD label="Reporting Manager" error={errors.manager_id}>
              <select
                value={form.manager_id}
                onChange={set('manager_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— Select manager —</option>
                {managers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.first_name} {m.last_name}
                  </option>
                ))}
              </select>
            </FIELD>
            <FIELD label="Phone" error={errors.phone}>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                placeholder="e.g. +230 5900 0000"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
          </div>
        </section>

        {/* ── Probation Period ─────────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Probation Period
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="Start Date" required error={errors.start_date}>
              <input
                type="date"
                value={form.start_date}
                onChange={set('start_date')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
            <FIELD label="Probation End Date" required error={errors.probation_end_date}>
              <input
                type="date"
                value={form.probation_end_date}
                onChange={set('probation_end_date')}
                min={form.start_date || undefined}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </FIELD>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            A probation record will be created automatically using these dates.
          </p>
        </section>

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 transition hover:opacity-90"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Creating…' : 'Create Employee'}
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
