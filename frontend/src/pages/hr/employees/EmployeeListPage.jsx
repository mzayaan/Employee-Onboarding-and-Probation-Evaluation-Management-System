// =============================================================================
// src/pages/hr/employees/EmployeeListPage.jsx
// HR view — lists all employee profiles with search and status badge.
// FR-04 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { getEmployees, getDepartments, toggleUserStatus } from '@/api/employeeApi'
import { UserPlus, Search, Loader2, AlertCircle } from 'lucide-react'

const STATUS_BADGE = {
  true:  { label: 'Active',   bg: '#dcfce7', color: '#15803d' },
  false: { label: 'Inactive', bg: '#fee2e2', color: '#b91c1c' },
}

const ONBOARDING_BADGE = {
  IN_PROGRESS: { label: 'In Progress', bg: '#fef3c7', color: '#b45309' },
  COMPLETED:   { label: 'Completed',   bg: '#dcfce7', color: '#15803d' },
}

export default function EmployeeListPage() {
  const navigate = useNavigate()
  const [employees,   setEmployees]   = useState([])
  const [filtered,    setFiltered]    = useState([])
  const [search,      setSearch]      = useState('')
  const [deptFilter,  setDeptFilter]  = useState('')   // department_id or ''
  const [statusFilter,setStatusFilter]= useState('')   // 'active' | 'inactive' | ''
  const [departments, setDepartments] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [toggling,    setToggling]    = useState(null)

  useEffect(() => {
    fetchEmployees()
    fetchDepartments()
  }, [])

  const fetchDepartments = async () => {
    try {
      const data = await getDepartments()
      setDepartments(data)
    } catch {
      // Non-critical — filter simply won't show department options
    }
  }

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      employees.filter((e) => {
        const full = `${e.user?.first_name} ${e.user?.last_name} ${e.user?.email} ${e.job_title} ${e.department?.name ?? ''}`.toLowerCase()
        const matchSearch = full.includes(q)
        const matchDept   = deptFilter === '' || String(e.department?.department_id) === deptFilter
        const matchStatus = statusFilter === ''
          || (statusFilter === 'active'   &&  e.user?.is_active)
          || (statusFilter === 'inactive' && !e.user?.is_active)
        return matchSearch && matchDept && matchStatus
      })
    )
  }, [search, deptFilter, statusFilter, employees])

  const fetchEmployees = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getEmployees()
      setEmployees(data)
      setFiltered(data)
    } catch {
      setError('Failed to load employees. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (userId, currentStatus) => {
    setToggling(userId)
    try {
      await toggleUserStatus(userId, !currentStatus)
      setEmployees((prev) =>
        prev.map((e) =>
          e.user?.user_id === userId
            ? { ...e, user: { ...e.user, is_active: !currentStatus } }
            : e
        )
      )
    } catch {
      alert('Failed to update status. Please try again.')
    } finally {
      setToggling(null)
    }
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Employees</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage employee accounts and onboarding profiles
          </p>
        </div>
        <button
          onClick={() => navigate('/hr/employees/add')}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <UserPlus className="h-4 w-4" />
          Add Employee
        </button>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Department filter */}
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.department_id} value={String(d.department_id)}>{d.name}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-200">
          <UserPlus className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">
            {(search || deptFilter || statusFilter)
              ? 'No employees match your filters.'
              : 'No employees yet. Add one to get started.'}
          </p>
          {!(search || deptFilter || statusFilter) && (
            <button
              onClick={() => navigate('/hr/employees/add')}
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              <UserPlus className="h-4 w-4" />
              Add First Employee
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50">
                {['Employee', 'Job Title', 'Department', 'Onboarding', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((emp) => {
                const u       = emp.user ?? {}
                const statusB = STATUS_BADGE[String(u.is_active)]
                const onbB    = ONBOARDING_BADGE[emp.onboarding_status] ?? ONBOARDING_BADGE.IN_PROGRESS
                return (
                  <tr key={emp.profile_id} className="hover:bg-slate-50 transition-colors">
                    {/* Employee */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: '#1e3a5f' }}
                        >
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Job Title */}
                    <td className="px-5 py-4 text-sm text-slate-600">{emp.job_title}</td>
                    {/* Department */}
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {emp.department?.name ?? <span className="text-slate-400">—</span>}
                    </td>
                    {/* Onboarding */}
                    <td className="px-5 py-4">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: onbB.bg, color: onbB.color }}
                      >
                        {onbB.label}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-5 py-4">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: statusB.bg, color: statusB.color }}
                      >
                        {statusB.label}
                      </span>
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => navigate(`/hr/employees/${emp.profile_id}`)}
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          View
                        </button>
                        <button
                          disabled={toggling === u.user_id}
                          onClick={() => handleToggle(u.user_id, u.is_active)}
                          className="text-xs font-medium hover:underline disabled:opacity-50"
                          style={{ color: u.is_active ? '#b91c1c' : '#15803d' }}
                        >
                          {toggling === u.user_id
                            ? '…'
                            : u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Showing {filtered.length} of {employees.length} employee{employees.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </AppShell>
  )
}
