// =============================================================================
// src/pages/hr/hrdc/HRDCTrainingPage.jsx
// HRDC G1 Training Log — HR Admin panel
//
// Allows HR Administrators to:
//   1. View all HRDC training log entries across the organisation.
//   2. Add new training log entries for any employee.
//   3. Delete entries.
//   4. Download the HRDC G1 Training Log PDF export (maps rows to the
//      standard Mauritius HRDC refund claim format).
//
// The Human Resource Development Council (HRDC) administers the Training
// Levy under the Human Resource Development Act. Employers contributing
// to the levy may claim refunds for approved training programmes via the
// HRDC G1 form. This page provides the data entry and export workflow.
//
// FR-NEW-01 | Objective 1 (extended)
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  getTrainingLogs, addTrainingLog, deleteTrainingLog, downloadHRDCG1Export,
} from '@/api/hrdcApi'
import { getEmployees } from '@/api/employeeApi'
import {
  BookOpen, Download, Plus, Trash2, AlertTriangle,
  CheckCircle, X, Loader2,
} from 'lucide-react'

// ── Format MUR currency ───────────────────────────────────────────────────────
const fmtMUR = (n) =>
  Number(n ?? 0).toLocaleString('en-MU', {
    style: 'currency', currency: 'MUR', maximumFractionDigits: 2,
  })

// ── Empty form state factory ──────────────────────────────────────────────────
const emptyForm = () => ({
  profile_id:               '',
  course_name:              '',
  training_provider:        'Internal',
  hrdc_approved_course_code: '',
  training_cost:            '',
  duration_hours:           '',
  completed_date:           new Date().toISOString().split('T')[0],
})

// ── Component ─────────────────────────────────────────────────────────────────
export default function HRDCTrainingPage() {
  const [logs,          setLogs]          = useState([])
  const [employees,     setEmployees]     = useState([])
  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState(false)

  // Add-entry form
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState(emptyForm())
  const [saving,        setSaving]        = useState(false)
  const [saveError,     setSaveError]     = useState('')
  const [saveOk,        setSaveOk]        = useState(false)

  // Delete
  const [deletingId,    setDeletingId]    = useState(null)

  // Export
  const [exporting,     setExporting]     = useState(false)
  const [exportError,   setExportError]   = useState('')

  // ── Load data ─────────────────────────────────────────────────────────────
  const reload = () => {
    setLoading(true)
    setLoadError(false)
    Promise.allSettled([
      getTrainingLogs(),
      getEmployees(),
    ]).then(([logsR, empR]) => {
      if (logsR.status === 'fulfilled') setLogs(logsR.value ?? [])
      else setLoadError(true)
      if (empR.status === 'fulfilled') setEmployees(empR.value ?? [])
    }).finally(() => setLoading(false))
  }

  useEffect(reload, [])

  // ── Form helpers ──────────────────────────────────────────────────────────
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    setSaveOk(false)
    try {
      await addTrainingLog({
        profile_id:                Number(form.profile_id),
        course_name:               form.course_name.trim(),
        training_provider:         form.training_provider.trim() || 'Internal',
        hrdc_approved_course_code: form.hrdc_approved_course_code.trim() || null,
        training_cost:             parseFloat(form.training_cost) || 0,
        duration_hours:            parseInt(form.duration_hours, 10) || 0,
        completed_date:            form.completed_date,
      })
      setSaveOk(true)
      setForm(emptyForm())
      setTimeout(() => {
        setShowForm(false)
        setSaveOk(false)
        reload()
      }, 800)
    } catch (err) {
      setSaveError(err?.response?.data?.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this training log entry? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await deleteTrainingLog(id)
      setLogs((prev) => prev.filter((l) => l.training_id !== id))
    } catch {
      alert('Failed to delete entry. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  // ── G1 Export ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    setExportError('')
    try {
      const blob = await downloadHRDCG1Export()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `HRDC_G1_Training_Log_${new Date().toISOString().split('T')[0]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(
        err?.response?.data?.message ||
        'Export failed. Please ensure there are training entries to export and try again.'
      )
    } finally {
      setExporting(false)
    }
  }

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalCost  = logs.reduce((s, l) => s + Number(l.training_cost ?? 0), 0)
  const totalHours = logs.reduce((s, l) => s + Number(l.duration_hours ?? 0), 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full flex-shrink-0"
               style={{ backgroundColor: '#1e3a5f18' }}>
            <BookOpen className="h-6 w-6" style={{ color: '#1e3a5f' }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>HRDC Training Log</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Record employee training activity and export the HRDC G1 refund claim form.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => { setShowForm((v) => !v); setSaveError(''); setSaveOk(false) }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2
                       text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Entry'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || logs.length === 0}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
                       text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {exporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {exporting ? 'Exporting…' : 'Export HRDC G1 Form'}
          </button>
        </div>
      </div>

      {/* Export error */}
      {exportError && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{exportError}</p>
        </div>
      )}

      {/* ── Add entry form ── */}
      {showForm && (
        <form
          onSubmit={handleAddSubmit}
          className="mb-6 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden"
        >
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">New Training Log Entry</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* Employee */}
            <div className="lg:col-span-1">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Employee <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={form.profile_id}
                onChange={(e) => setField('profile_id', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select employee…</option>
                {employees.map((emp) => (
                  <option key={emp.profile_id} value={emp.profile_id}>
                    {emp.user?.first_name} {emp.user?.last_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Course name */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Course Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.course_name}
                onChange={(e) => setField('course_name', e.target.value)}
                placeholder="e.g. Advanced Excel for HR Professionals"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Training provider */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Training Provider <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.training_provider}
                onChange={(e) => setField('training_provider', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* HRDC course code */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                HRDC / MQA Course Code
                <span className="ml-1 text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={form.hrdc_approved_course_code}
                onChange={(e) => setField('hrdc_approved_course_code', e.target.value)}
                placeholder="e.g. MQA/PGR/0234/21"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Cost MUR */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Training Cost (MUR) <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.training_cost}
                onChange={(e) => setField('training_cost', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Duration (hours) <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="number"
                min={1}
                value={form.duration_hours}
                onChange={(e) => setField('duration_hours', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Completed date */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Completed Date <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="date"
                value={form.completed_date}
                onChange={(e) => setField('completed_date', e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Form footer */}
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 flex items-center justify-between">
            {saveOk ? (
              <p className="text-xs font-medium text-green-700 flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" /> Entry saved successfully.
              </p>
            ) : saveError ? (
              <p className="text-xs text-red-600">{saveError}</p>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
                         text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      )}

      {/* ── Summary stats ── */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <div className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Total Entries</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#0f1c2e' }}>{logs.length}</p>
          </div>
          <div className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Total Training Cost</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#0f1c2e' }}>{fmtMUR(totalCost)}</p>
          </div>
          <div className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">Total Training Hours</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#0f1c2e' }}>{totalHours} hrs</p>
          </div>
        </div>
      )}

      {/* ── Log table ── */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Training Entries</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            All recorded training activity eligible for HRDC levy refund claims.
          </p>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400 animate-pulse">
            Loading training records…
          </div>
        ) : loadError ? (
          <div className="px-5 py-8 text-center text-sm text-red-500">
            Could not load training records. Please refresh.
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <BookOpen className="h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500">No training entries yet.</p>
            <p className="text-xs text-slate-400">
              Use the <strong>Add Entry</strong> button above to record the first training activity.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">Employee</th>
                  <th className="px-5 py-3 text-left">Course</th>
                  <th className="px-5 py-3 text-left">Provider</th>
                  <th className="px-5 py-3 text-left">HRDC Code</th>
                  <th className="px-5 py-3 text-right">Cost (MUR)</th>
                  <th className="px-5 py-3 text-right">Hours</th>
                  <th className="px-5 py-3 text-left">Completed</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.training_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {log.employeeProfile?.user
                        ? `${log.employeeProfile.user.first_name} ${log.employeeProfile.user.last_name}`
                        : `Profile #${log.profile_id}`
                      }
                    </td>
                    <td className="px-5 py-3 text-slate-700 max-w-[180px] truncate">
                      {log.course_name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{log.training_provider}</td>
                    <td className="px-5 py-3">
                      {log.hrdc_approved_course_code ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 font-mono">
                          {log.hrdc_approved_course_code}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-700">
                      {fmtMUR(log.training_cost)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600">{log.duration_hours}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {log.completed_date
                        ? new Date(log.completed_date).toLocaleDateString('en-MU', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—'
                      }
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDelete(log.training_id)}
                        disabled={deletingId === log.training_id}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs
                                   text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Delete entry"
                      >
                        {deletingId === log.training_id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* G1 export note */}
      {!loading && logs.length > 0 && (
        <p className="mt-4 text-xs text-slate-400 text-center">
          The <strong>Export HRDC G1 Form</strong> button generates a PDF pre-populated with the above entries
          in the standard HRDC levy refund claim format. Entries without an HRDC course code will still appear
          but will not be eligible for refund without MQA approval.
        </p>
      )}
    </AppShell>
  )
}
