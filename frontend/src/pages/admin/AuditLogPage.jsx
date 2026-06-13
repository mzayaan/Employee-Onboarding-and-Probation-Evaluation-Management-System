// =============================================================================
// src/pages/admin/AuditLogPage.jsx
// System Audit Log — read-only view for System Administrators.
// Matches Figma 12:40.
// FR-18 | NFR-08 | Objective 4
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getAuditLogs } from '@/api/auditApi'
import { Search, Download, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

// ── Action-type badge colours (matches Figma) ────────────────────────────────
const ACTION_COLOURS = {
  DOCUMENT_UPLOAD:           { bg: '#dbeafe', text: '#1d4ed8' },
  DOCUMENT_APPROVED:         { bg: '#dcfce7', text: '#15803d' },
  DOCUMENT_REJECTED:         { bg: '#fee2e2', text: '#b91c1c' },
  EVALUATION_SUBMITTED:      { bg: '#dcfce7', text: '#15803d' },
  SELF_ASSESSMENT_SUBMITTED: { bg: '#fed7aa', text: '#c2410c' },
  EMPLOYEE_CREATED:          { bg: '#dcfce7', text: '#15803d' },
  CRITERIA_UPDATED:          { bg: '#fef9c3', text: '#854d0e' },
  TASK_ASSIGNED:             { bg: '#dbeafe', text: '#1d4ed8' },
  TASK_STATUS_UPDATED:       { bg: '#ede9fe', text: '#6d28d9' },
  TASK_COMPLETED:            { bg: '#dcfce7', text: '#15803d' },
  TASK_DELETED:              { bg: '#fee2e2', text: '#b91c1c' },
  RECOMMENDATION_GENERATED:  { bg: '#ede9fe', text: '#6d28d9' },
  PDF_GENERATED:             { bg: '#dbeafe', text: '#1d4ed8' },
  LOGIN:                     { bg: '#f0fdf4', text: '#15803d' },
  LOGOUT:                    { bg: '#f1f5f9', text: '#475569' },
  USER_CREATED:              { bg: '#dcfce7', text: '#15803d' },
  USER_DEACTIVATED:          { bg: '#fee2e2', text: '#b91c1c' },
  PASSWORD_RESET:            { bg: '#fef9c3', text: '#854d0e' },
  EMPLOYEE_UPDATED:          { bg: '#dbeafe', text: '#1d4ed8' },
  PROBATION_PERIOD_CREATED:  { bg: '#dcfce7', text: '#15803d' },
  PROBATION_STATUS_CHANGED:  { bg: '#fed7aa', text: '#c2410c' },
}

const defaultColour = { bg: '#f1f5f9', text: '#475569' }

function ActionBadge({ type }) {
  const col = ACTION_COLOURS[type] || defaultColour
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: col.bg, color: col.text }}
    >
      {type}
    </span>
  )
}

// ── Role display label ────────────────────────────────────────────────────────
const roleLabel = {
  HR_ADMIN:     'HR Admin',
  LINE_MANAGER: 'Manager',
  NEW_EMPLOYEE: 'Employee',
  SYSTEM_ADMIN: 'Sys Admin',
}

// ── Timestamp formatter ───────────────────────────────────────────────────────
const fmtDateTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

// ── CSV export ────────────────────────────────────────────────────────────────
const exportCSV = (rows) => {
  const header = ['Timestamp', 'User', 'Role', 'Action Type', 'Description', 'IP Address']
  const lines  = rows.map((r) => [
    fmtDateTime(r.created_at),
    `${r.actor?.first_name || ''} ${r.actor?.last_name || ''}`.trim(),
    roleLabel[r.actor?.role] || r.actor?.role || '—',
    r.action_type,
    `"${(r.description || '').replace(/"/g, '""')}"`,
    r.ip_address || '—',
  ])
  const csv  = [header, ...lines].map((l) => l.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const [logs,       setLogs]       = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 })
  const [search,     setSearch]     = useState('')
  const [actionType, setActionType] = useState('')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  // Debounced search input
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true)
    setError(null)
    try {
      const res = await getAuditLogs({
        search:      debouncedSearch,
        action_type: actionType,
        page,
        limit:       25,
      })
      setLogs(res.data)
      setPagination(res.pagination)
    } catch {
      setError('Failed to load audit logs.')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, actionType])

  useEffect(() => { fetchLogs(1) }, [fetchLogs])

  const goPage = (p) => fetchLogs(p)

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>System Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track all significant system actions for compliance and traceability (FR-18)
          </p>
        </div>
        <button
          onClick={() => exportCSV(logs)}
          disabled={!logs.length}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-40"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Action type filter */}
        <select
          value={actionType}
          onChange={(e) => { setActionType(e.target.value) }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400"
        >
          <option value="">All Action Types</option>
          {Object.keys(ACTION_COLOURS).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-sm text-slate-400">
            No audit log entries found.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Timestamp', 'User', 'Role', 'Action Type', 'Description'].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.log_id} className="hover:bg-slate-50 transition-colors">
                  {/* Timestamp */}
                  <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                    {fmtDateTime(log.created_at)}
                  </td>

                  {/* User */}
                  <td className="px-6 py-4 font-medium text-slate-800 whitespace-nowrap">
                    {log.actor
                      ? `${log.actor.first_name} ${log.actor.last_name}`
                      : `User #${log.user_id}`}
                  </td>

                  {/* Role */}
                  <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                    {roleLabel[log.actor?.role] || log.actor?.role || '—'}
                  </td>

                  {/* Action type */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <ActionBadge type={log.action_type} />
                  </td>

                  {/* Description */}
                  <td className="px-6 py-4 text-slate-600 max-w-md">
                    <span className="line-clamp-2">{log.description}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing {((pagination.page - 1) * pagination.limit) + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </button>
            <span className="text-xs">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => goPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </AppShell>
  )
}
