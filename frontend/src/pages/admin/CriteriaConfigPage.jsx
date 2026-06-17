// =============================================================================
// src/pages/admin/CriteriaConfigPage.jsx
// System Admin configures evaluation criteria and weights.
// Matches Figma 12:39.
// FR-10 | NFR-03 | Objective 2
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import {
  getCriteria,
  createCriterion,
  updateCriterion,
  deactivateCriterion,
} from '@/api/criteriaApi'
import {
  Plus, Loader2, AlertCircle, CheckCircle, X,
  Settings, Pencil, PowerOff,
} from 'lucide-react'

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
// usedWeight = sum of all OTHER active criteria weights (excluding the one being
// edited, if editing).  Allows the modal to show how much budget is left and
// validate that the new weight won't exceed 100%.
function CriterionModal({ existing, onClose, onSaved, usedWeight }) {
  const [form, setForm] = useState({
    name:          existing?.name          ?? '',
    description:   existing?.description   ?? '',
    weight_percent: existing?.weight_percent ?? '',
    display_order: existing?.display_order ?? 0,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  // How much weight budget is available for this criterion
  const remaining = parseFloat((100 - usedWeight).toFixed(2))
  const enteredW  = parseFloat(form.weight_percent)
  const budgetOk  = !isNaN(enteredW) && enteredW > 0 && enteredW <= remaining + 0.01

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Criterion name is required.'); return }
    const w = parseFloat(form.weight_percent)
    if (isNaN(w) || w <= 0 || w > 100) { setError('Weight must be between 1 and 100.'); return }
    if (w > remaining + 0.01) {
      setError(`Weight would exceed the remaining budget of ${remaining}%. Adjust other criteria first.`)
      return
    }

    setSubmitting(true); setError('')
    try {
      if (existing) {
        await updateCriterion(existing.criterion_id, {
          name:           form.name.trim(),
          description:    form.description.trim() || null,
          weight_percent: w,
          display_order:  Number(form.display_order),
        })
      } else {
        await createCriterion({
          name:           form.name.trim(),
          description:    form.description.trim() || null,
          weight_percent: w,
          display_order:  Number(form.display_order),
        })
      }
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save criterion.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-800">
            {existing ? 'Edit Criterion' : 'Add Criterion'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Criterion Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Job Performance"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={set('description')}
              placeholder="Guidance shown to evaluators..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Weight (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={remaining}
                step="0.01"
                value={form.weight_percent}
                onChange={set('weight_percent')}
                placeholder={`max ${remaining}%`}
                className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 ${
                  !isNaN(enteredW) && enteredW > 0
                    ? budgetOk
                      ? 'border-green-300 focus:border-green-400 focus:ring-green-100'
                      : 'border-red-300 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
                }`}
              />
              <p className={`mt-1 text-xs ${remaining <= 0 ? 'text-red-600' : 'text-slate-400'}`}>
                {remaining <= 0
                  ? 'No budget remaining — deactivate a criterion first.'
                  : `${remaining}% remaining`}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Display Order</label>
              <input
                type="number"
                min="0"
                value={form.display_order}
                onChange={set('display_order')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><CheckCircle className="h-4 w-4" /> {existing ? 'Save Changes' : 'Add Criterion'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CriteriaConfigPage() {
  const { user } = useAuth()

  const [criteria,   setCriteria]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [modal,      setModal]      = useState(null)     // null | 'add' | criterion object
  const [deactivating, setDeactivating] = useState(null) // criterion_id being deactivated

  const fetchCriteria = () => {
    setLoading(true)
    getCriteria()
      .then(setCriteria)
      .catch(() => setError('Failed to load criteria.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchCriteria() }, [])

  const handleDeactivate = async (criterion) => {
    if (!window.confirm(`Deactivate "${criterion.name}"? It will be excluded from new evaluations.`)) return
    setDeactivating(criterion.criterion_id)
    try {
      await deactivateCriterion(criterion.criterion_id)
      fetchCriteria()
    } catch {
      alert('Failed to deactivate criterion.')
    } finally {
      setDeactivating(null)
    }
  }

  const activeCriteria  = criteria.filter((c) => c.is_active)
  const totalWeight     = activeCriteria.reduce((sum, c) => sum + parseFloat(c.weight_percent), 0)
  const weightValid     = Math.abs(totalWeight - 100) < 0.01
  const weightPct       = totalWeight.toFixed(2)

  return (
    <AppShell>
      {modal && (
        <CriterionModal
          existing={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchCriteria() }}
          // Pass weight already used by OTHER active criteria so the modal can
          // show the remaining budget and prevent exceeding 100% (FR-10).
          usedWeight={
            modal === 'add'
              ? totalWeight
              : activeCriteria
                  .filter((c) => c.criterion_id !== modal?.criterion_id)
                  .reduce((s, c) => s + parseFloat(c.weight_percent), 0)
          }
        />
      )}

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            Evaluation Criteria Configuration
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure weighted evaluation criteria applied to all probation assessments. Weights must total 100%.
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm flex-shrink-0"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <Plus className="h-4 w-4" /> Add Criterion
        </button>
      </div>

      {/* Total weight banner */}
      <div className={`mb-6 flex items-center gap-4 rounded-xl border px-6 py-4 ${
        weightValid ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
      }`}>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-slate-600">Total Weight:</span>
          <span
            className="text-3xl font-bold"
            style={{ color: weightValid ? '#15803d' : '#b45309' }}
          >
            {loading ? '—' : `${weightPct}%`}
          </span>
        </div>
        {!loading && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${
            weightValid ? 'text-green-700' : 'text-amber-700'
          }`}>
            {weightValid
              ? <><CheckCircle className="h-4 w-4" /> All criteria weights are valid and sum to 100%</>
              : <><AlertCircle className="h-4 w-4" /> Active criteria weights must total exactly 100%</>}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Criteria table */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : criteria.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-sm text-slate-400">
            <Settings className="h-10 w-10 text-slate-200 mb-3" />
            No criteria configured. Add the first criterion to get started.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Criterion Name', 'Description', 'Weight (%)', 'Status', 'Actions'].map((h) => (
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
              {criteria.map((criterion) => (
                <tr key={criterion.criterion_id} className="hover:bg-slate-50 transition-colors">
                  {/* Name */}
                  <td className="px-6 py-4 font-medium text-slate-800 whitespace-nowrap">
                    {criterion.name}
                  </td>

                  {/* Description */}
                  <td className="px-6 py-4 text-slate-500 max-w-xs">
                    <span className="line-clamp-1">
                      {criterion.description || <span className="text-slate-300 italic">No description</span>}
                    </span>
                  </td>

                  {/* Weight */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold"
                      style={{ backgroundColor: '#e8edf5', color: '#1e3a5f' }}
                    >
                      {parseFloat(criterion.weight_percent)}%
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={
                        criterion.is_active
                          ? { backgroundColor: '#dcfce7', color: '#15803d' }
                          : { backgroundColor: '#f1f5f9', color: '#64748b' }
                      }
                    >
                      {criterion.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModal(criterion)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      {criterion.is_active && (
                        <button
                          onClick={() => handleDeactivate(criterion)}
                          disabled={deactivating === criterion.criterion_id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        >
                          {deactivating === criterion.criterion_id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <PowerOff className="h-3 w-3" />}
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
