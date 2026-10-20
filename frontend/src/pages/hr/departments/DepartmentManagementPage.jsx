// =============================================================================
// src/pages/hr/departments/DepartmentManagementPage.jsx
//
// HR Administrator page for managing departments and assigning a dedicated
// LINE_MANAGER to each department (lecturer requirement: one manager per dept).
//
// Features:
//  — List all departments with their current manager (if any)
//  — Create a new department (name + optional description)
//  — Assign or re-assign a LINE_MANAGER as the dedicated department manager
//  — Remove (un-assign) the current manager from a department
//
// API endpoints used:
//  GET    /api/departments                   → listDepartments
//  POST   /api/departments                   → createDepartment
//  PATCH  /api/departments/:id/manager       → assignDepartmentManager
//  DELETE /api/departments/:id/manager       → removeDepartmentManager
//
// FR-04, FR-07 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  getDepartments,
  createDepartment,
  getManagers,
  assignDepartmentManager,
  removeDepartmentManager,
} from '@/api/employeeApi'
import {
  Building2, Plus, Loader2, AlertCircle, CheckCircle2,
  UserCheck, UserX, ChevronDown,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ---------------------------------------------------------------------------
// Department row
// ---------------------------------------------------------------------------
function DeptRow({ dept, managers, onAssign, onRemove }) {
  const [open,   setOpen]   = useState(false)
  const [selMgr, setSelMgr] = useState('')
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState('')

  const current = dept.departmentManager ?? null  // Sequelize alias: departmentManager
  const availableManagers = managers.filter(
    (m) => !current || m.user_id !== current.user_id
  )

  const doAssign = async () => {
    if (!selMgr) { setErr('Select a manager first.'); return }
    setBusy(true); setErr('')
    try {
      await onAssign(dept.department_id, Number(selMgr))
      setOpen(false); setSelMgr('')
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to assign manager.')
    } finally {
      setBusy(false)
    }
  }

  const doRemove = async () => {
    setBusy(true); setErr('')
    try {
      await onRemove(dept.department_id)
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to remove manager.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      {/* Department header */}
      <div className="flex items-start justify-between px-6 py-4">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: '#e8f0fb' }}
          >
            <Building2 className="h-4 w-4" style={{ color: '#1e3a5f' }} />
          </div>
          <div>
            <p className="font-semibold text-slate-800">{dept.name}</p>
            {dept.description && (
              <p className="mt-0.5 text-xs text-slate-400">{dept.description}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">Created {fmtDate(dept.created_at)}</p>
          </div>
        </div>

        {/* Current manager badge */}
        <div className="text-right">
          {current ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200">
              <UserCheck className="h-3.5 w-3.5" />
              {current.first_name} {current.last_name}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
              <UserX className="h-3.5 w-3.5" />
              No manager assigned
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {err && (
        <div className="mx-6 mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-xs text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {err}
        </div>
      )}

      {/* Action strip */}
      <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
        {/* Toggle assign panel */}
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); setErr('') }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <UserCheck className="h-3.5 w-3.5" />
          {current ? 'Change Manager' : 'Assign Manager'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Remove manager */}
        {current && (
          <button
            type="button"
            disabled={busy}
            onClick={doRemove}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
            Remove Manager
          </button>
        )}
      </div>

      {/* Inline assign panel */}
      {open && (
        <div className="border-t border-slate-100 px-6 py-4 bg-white">
          <p className="mb-3 text-sm font-medium text-slate-700">
            {current ? 'Reassign manager' : 'Assign a manager'} for <span className="font-semibold">{dept.name}</span>
          </p>
          <div className="flex items-center gap-3">
            <select
              value={selMgr}
              onChange={(e) => { setSelMgr(e.target.value); setErr('') }}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">— Select a line manager —</option>
              {availableManagers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.first_name} {m.last_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selMgr}
              onClick={doAssign}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition hover:opacity-90"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setSelMgr(''); setErr('') }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
          {availableManagers.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              No other line managers are available. Add a LINE_MANAGER account first.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function DepartmentManagementPage() {
  const [departments, setDepartments] = useState([])
  const [managers,    setManagers]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadErr,     setLoadErr]     = useState(null)

  // Create-department form
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [creating,   setCreating]   = useState(false)
  const [createErr,  setCreateErr]  = useState('')
  const [createOk,   setCreateOk]   = useState(false)

  const load = () => {
    setLoading(true); setLoadErr(null)
    Promise.all([getDepartments(), getManagers()])
      .then(([depts, mgrs]) => {
        setDepartments(depts || [])
        setManagers(mgrs   || [])
      })
      .catch(() => setLoadErr('Failed to load departments.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim()) { setCreateErr('Department name is required.'); return }
    setCreating(true); setCreateErr(''); setCreateOk(false)
    try {
      await createDepartment({ name: newName.trim(), description: newDesc.trim() || undefined })
      setCreateOk(true); setNewName(''); setNewDesc('')
      setShowCreate(false)
      load()
    } catch (err) {
      setCreateErr(err?.response?.data?.message || 'Failed to create department.')
    } finally {
      setCreating(false)
    }
  }

  const handleAssign = async (deptId, managerId) => {
    await assignDepartmentManager(deptId, managerId)
    load()
  }

  const handleRemove = async (deptId) => {
    await removeDepartmentManager(deptId)
    load()
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            Department Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage departments and assign a dedicated line manager to each.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreate((v) => !v); setCreateErr(''); setCreateOk(false) }}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <Plus className="h-4 w-4" />
          New Department
        </button>
      </div>

      {/* Create department panel */}
      {showCreate && (
        <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Create New Department</h2>
          {createErr && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {createErr}
            </div>
          )}
          {createOk && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700 ring-1 ring-green-200">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Department created successfully.
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Department Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setCreateErr('') }}
                placeholder="e.g. Engineering"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Description <span className="text-slate-400 text-xs font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="sm:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 transition hover:opacity-90"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {creating ? 'Creating…' : 'Create Department'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Department list */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : loadErr ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-6 py-4 text-sm text-red-600 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {loadErr}
        </div>
      ) : departments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 px-8 py-16 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-medium text-slate-500">No departments yet.</p>
          <p className="mt-1 text-sm text-slate-400">Click "New Department" to add one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            {departments.length} department{departments.length !== 1 ? 's' : ''} — each may have at most one dedicated manager.
          </p>
          {departments.map((d) => (
            <DeptRow
              key={d.department_id}
              dept={d}
              managers={managers}
              onAssign={handleAssign}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </AppShell>
  )
}
