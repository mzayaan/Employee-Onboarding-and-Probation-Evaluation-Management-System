// =============================================================================
// src/pages/admin/SystemConfigPage.jsx
// System Administrator — Minimum Salary Configuration
//
// Displays the current active minimum salary baseline and the full history of
// all past entries. Allows the System Administrator to append a new entry
// (effective from a chosen date) without overwriting historical records.
//
// The page follows the append-only design from the spec: each legislative
// change is a new row; previous rows are never modified or deleted.
//
// Spec s.1.3, s.2.2 | FR-NEW-02 | NFR-08
// IMPORTANT: Rates shown are reference values only. Verify current statutory
//            figures against official Remuneration Orders before production use.
// =============================================================================

import { useState, useEffect } from 'react'
import { DollarSign, PlusCircle, History, AlertTriangle } from 'lucide-react'
import { getCurrentConfig, getConfigHistory, createConfig } from '@/api/systemConfigApi'
import AppShell from '@/components/shared/AppShell'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate  = (d) => (d ? new Date(d).toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const fmtMUR   = (n) => `Rs ${Number(n).toLocaleString('en-MU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const today    = () => new Date().toISOString().slice(0, 10)

// ── Empty add form ────────────────────────────────────────────────────────────
const EMPTY = { min_salary_mur: '', effective_date: today() }

export default function SystemConfigPage() {
  const [current,  setCurrent]  = useState(null)
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // Add-form state
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')
  const [success,  setSuccess]  = useState('')

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const [cur, hist] = await Promise.all([getCurrentConfig(), getConfigHistory()])
      setCurrent(cur)
      setHistory(hist)
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load configuration.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  // ── Handle form field change ────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setFormErr('')
    setSuccess('')
  }

  // ── Submit new config ───────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormErr('')
    setSuccess('')

    const salary = parseFloat(form.min_salary_mur)
    if (!form.min_salary_mur || isNaN(salary) || salary <= 0) {
      return setFormErr('Please enter a valid positive salary amount.')
    }
    if (!form.effective_date) {
      return setFormErr('Effective date is required.')
    }

    setSaving(true)
    try {
      await createConfig({ min_salary_mur: salary, effective_date: form.effective_date })
      setSuccess('New minimum salary configuration saved successfully.')
      setForm(EMPTY)
      setShowForm(false)
      await loadData()
    } catch (e) {
      setFormErr(e?.response?.data?.message || 'Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AppShell>
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Minimum Salary Configuration</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage the statutory minimum monthly salary baseline used for salary validation across the system.
        </p>
      </div>

      {/* Disclaimer banner */}
      <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-500" />
        <p>
          Figures shown are reference values only (general monthly baseline, 2026). Verify current
          statutory rates against official Remuneration Orders and the National Remuneration Board
          before enabling strict enforcement in a production environment.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Current active rate card */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <DollarSign className="h-5 w-5 text-indigo-500" />
            Currently Active Rate
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setFormErr(''); setSuccess('') }}
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            <PlusCircle className="h-4 w-4" />
            {showForm ? 'Cancel' : 'Add New Entry'}
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-sm text-slate-400">Loading…</div>
        ) : current ? (
          <div className="px-6 py-5 flex flex-wrap gap-8">
            <div>
              <p className="text-xs text-slate-500 mb-1">Monthly Minimum (MUR)</p>
              <p className="text-3xl font-bold text-slate-900">{fmtMUR(current.min_salary_mur)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Effective From</p>
              <p className="text-lg font-semibold text-slate-700">{fmtDate(current.effective_date)}</p>
            </div>
            {current.updatedByUser && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Set By</p>
                <p className="text-sm text-slate-700">
                  {current.updatedByUser.first_name} {current.updatedByUser.last_name}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-5 text-sm text-slate-500">No active configuration found.</div>
        )}

        {/* Add new entry form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="px-6 py-5 border-t border-slate-100 bg-slate-50 space-y-4"
          >
            <p className="text-sm font-medium text-slate-700">
              Add a new minimum salary entry. A new row is created — existing entries are never modified.
            </p>

            {formErr  && <p className="text-sm text-red-600">{formErr}</p>}
            {success  && <p className="text-sm text-green-700">{success}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Monthly Minimum (MUR) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="min_salary_mur"
                  value={form.min_salary_mur}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  placeholder="e.g. 18500.00"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Current reference baseline: Rs 17,745.00 (general monthly, 2026)
                </p>
              </div>

              {/* Effective date */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Effective Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="effective_date"
                  value={form.effective_date}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Date from which this rate becomes legally effective.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Configuration'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* History table */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100 text-slate-800 font-semibold">
          <History className="h-5 w-5 text-slate-400" />
          Configuration History
        </div>

        {loading ? (
          <div className="px-6 py-8 text-sm text-slate-400">Loading…</div>
        ) : history.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-400">No configuration history found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  <th className="px-6 py-3">Effective Date</th>
                  <th className="px-6 py-3">Monthly Minimum (MUR)</th>
                  <th className="px-6 py-3">Set By</th>
                  <th className="px-6 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((row, i) => (
                  <tr
                    key={row.config_id}
                    className={i === 0 ? 'bg-indigo-50' : 'hover:bg-slate-50 transition-colors'}
                  >
                    <td className="px-6 py-3 font-medium text-slate-800">
                      {fmtDate(row.effective_date)}
                      {i === 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 font-mono text-slate-700">{fmtMUR(row.min_salary_mur)}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {row.updatedByUser
                        ? `${row.updatedByUser.first_name} ${row.updatedByUser.last_name}`
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-slate-500">{fmtDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
    </AppShell>
  )
}
