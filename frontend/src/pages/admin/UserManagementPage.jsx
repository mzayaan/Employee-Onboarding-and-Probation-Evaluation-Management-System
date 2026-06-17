// =============================================================================
// src/pages/admin/UserManagementPage.jsx
// System Administrator — view and manage all user accounts.
// Supports activate / deactivate toggle for any user except the caller's own.
// FR-01 | NFR-02, NFR-03, NFR-08 | Objective 1
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getAllUsers, toggleUserStatus } from '@/api/employeeApi'
import {
  Users, Search, Loader2, AlertCircle,
  CheckCircle2, XCircle, ShieldCheck,
  UserCog, UserCheck, UserX,
} from 'lucide-react'

// ── Role badge ────────────────────────────────────────────────────────────────
const ROLE_META = {
  HR_ADMIN:     { label: 'HR Admin',    bg: '#dbeafe', text: '#1d4ed8' },
  LINE_MANAGER: { label: 'Manager',     bg: '#ede9fe', text: '#6d28d9' },
  NEW_EMPLOYEE: { label: 'Employee',    bg: '#dcfce7', text: '#15803d' },
  SYSTEM_ADMIN: { label: 'Sys Admin',   bg: '#fef9c3', text: '#854d0e' },
}

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || { label: role, bg: '#f1f5f9', text: '#475569' }
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: meta.bg, color: meta.text }}
    >
      {meta.label}
    </span>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-50 text-green-700">
      <CheckCircle2 className="h-3 w-3" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-50 text-red-600">
      <XCircle className="h-3 w-3" /> Inactive
    </span>
  )
}

// ── Date formatter ────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Role filter options ───────────────────────────────────────────────────────
const ROLE_FILTERS = [
  { value: '',             label: 'All roles' },
  { value: 'HR_ADMIN',    label: 'HR Admin' },
  { value: 'LINE_MANAGER',label: 'Manager' },
  { value: 'NEW_EMPLOYEE',label: 'Employee' },
  { value: 'SYSTEM_ADMIN',label: 'Sys Admin' },
]

export default function UserManagementPage() {
  const { user: currentUser } = useAuth()

  const [users,       setUsers]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [search,      setSearch]      = useState('')
  const [roleFilter,  setRoleFilter]  = useState('')
  const [toggling,    setToggling]    = useState(null)   // user_id being toggled
  const [feedback,    setFeedback]    = useState(null)   // { type, message }

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    getAllUsers()
      .then(setUsers)
      .catch(() => setError('Failed to load users. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  // ── Toggle active/inactive ────────────────────────────────────────────────
  const handleToggle = async (u) => {
    if (u.user_id === currentUser?.user_id) return  // cannot change own status

    setToggling(u.user_id)
    setFeedback(null)
    try {
      await toggleUserStatus(u.user_id, !u.is_active)
      setUsers((prev) =>
        prev.map((x) => x.user_id === u.user_id ? { ...x, is_active: !u.is_active } : x)
      )
      setFeedback({
        type:    'success',
        message: `${u.first_name} ${u.last_name}'s account has been ${!u.is_active ? 'activated' : 'deactivated'}.`,
      })
    } catch {
      setFeedback({ type: 'error', message: 'Failed to update account status.' })
    } finally {
      setToggling(null)
    }
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    const matchSearch = !q || [u.first_name, u.last_name, u.email].some((f) =>
      f?.toLowerCase().includes(q)
    )
    const matchRole = !roleFilter || u.role === roleFilter
    return matchSearch && matchRole
  })

  // ── Counts ────────────────────────────────────────────────────────────────
  const totalActive   = users.filter((u) => u.is_active).length
  const totalInactive = users.length - totalActive

  return (
    <AppShell>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" style={{ color: '#1e3a5f' }} />
          <h1 className="text-xl font-bold" style={{ color: '#0f1c2e' }}>
            User Management
          </h1>
        </div>
        <p className="text-sm text-slate-500">
          View and manage all system user accounts. Account creation is performed by HR Administrators.
        </p>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users',    value: users.length,   icon: UserCog,   color: '#1e3a5f' },
          { label: 'Active',         value: totalActive,    icon: UserCheck, color: '#15803d' },
          { label: 'Inactive',       value: totalInactive,  icon: UserX,     color: '#b91c1c' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: color + '18' }}>
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-bold" style={{ color: '#0f1c2e' }}>{loading ? '—' : value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${
            feedback.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
          }`}
        >
          {feedback.type === 'success'
            ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {feedback.message}
        </div>
      )}

      {/* Search + filter bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
        >
          {ROLE_FILTERS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-5 py-4 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-slate-400">
          <Users className="h-8 w-8" />
          <p className="text-sm">No users match your search.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['User', 'Role', 'Status', 'Last Login', 'Created', 'Action'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((u) => {
                const isSelf    = u.user_id === currentUser?.user_id
                const isTogging = toggling === u.user_id
                return (
                  <tr key={u.user_id} className="hover:bg-slate-50 transition-colors">
                    {/* User name + email */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {u.first_name?.[0]}{u.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">
                            {u.first_name} {u.last_name}
                            {isSelf && (
                              <span className="ml-2 text-xs text-slate-400">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3">
                      <RoleBadge role={u.role} />
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge active={u.is_active} />
                    </td>
                    {/* Last login */}
                    <td className="px-4 py-3 text-slate-500">{fmtDate(u.last_login_at)}</td>
                    {/* Created */}
                    <td className="px-4 py-3 text-slate-500">{fmtDate(u.created_at)}</td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Own account
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggle(u)}
                          disabled={isTogging}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            u.is_active
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {isTogging
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : u.is_active
                              ? <UserX className="h-3 w-3" />
                              : <UserCheck className="h-3 w-3" />}
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Showing {filtered.length} of {users.length} users
          </div>
        </div>
      )}
    </AppShell>
  )
}
