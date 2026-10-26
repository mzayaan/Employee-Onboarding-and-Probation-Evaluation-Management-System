// =============================================================================
// src/pages/employee/TaxDeclarationPage.jsx
// MRA Employee Declaration Form (EDF) — Mauritius Income Tax Act
//
// Allows a NEW_EMPLOYEE to select their tax declaration category (A–G),
// declare dependants, and view a live PAYE estimate based on their
// contracted basic salary (read from the employee profile).
//
// Category definitions follow the Mauritius Revenue Authority (MRA) EDF
// categories in effect for the current assessment year:
//   A — Single individual / married, spouse employed (no child)
//   B — Married, spouse not employed (no dependent child)
//   C — Married with 1 dependent child (spouse not employed)
//   D — Married with 2 dependent children (spouse not employed)
//   E — Married with 3 dependent children (spouse not employed)
//   F — Married with 4+ dependent children (spouse not employed)
//   G — Single parent with at least 1 dependent child
//
// PAYE calculation uses MRA Band Rates (FY 2024–2025, illustrative):
//   0–390,000 MUR  → 0%
//   Next 30,000    → 10%
//   Above 420,000  → 15% (simplified progressive approximation)
//
// NFR-08 | FR-04 (extended) | FR-NEW-02
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getMyContract } from '@/api/contractApi'
import { getMyTaxDeclaration, submitTaxDeclaration } from '@/api/contractApi'
import {
  Calculator, CheckCircle, AlertTriangle, Info,
  ChevronRight, Save,
} from 'lucide-react'

// ── MRA Category definitions ─────────────────────────────────────────────────
const CATEGORIES = [
  {
    code: 'A',
    label: 'Category A',
    description: 'Single individual, or married individual whose spouse is employed or earns independent income.',
    exemption_mur: 0,
  },
  {
    code: 'B',
    label: 'Category B',
    description: 'Married individual whose spouse is not employed and has no independent income. No dependent children.',
    exemption_mur: 110_000,
  },
  {
    code: 'C',
    label: 'Category C',
    description: 'Married individual (spouse not employed) with 1 dependent child.',
    exemption_mur: 150_000,
  },
  {
    code: 'D',
    label: 'Category D',
    description: 'Married individual (spouse not employed) with 2 dependent children.',
    exemption_mur: 190_000,
  },
  {
    code: 'E',
    label: 'Category E',
    description: 'Married individual (spouse not employed) with 3 dependent children.',
    exemption_mur: 230_000,
  },
  {
    code: 'F',
    label: 'Category F',
    description: 'Married individual (spouse not employed) with 4 or more dependent children.',
    exemption_mur: 275_000,
  },
  {
    code: 'G',
    label: 'Category G',
    description: 'Single parent family (at least 1 dependent child).',
    exemption_mur: 150_000,
  },
]

// ── Simplified MRA PAYE band calculator (FY 2024–2025 illustrative) ──────────
function estimatePAYE(annualSalaryMur, additionalExemptionMur) {
  // Basic personal allowance (all taxpayers)
  const baseAllowance = 390_000
  const totalAllowance = baseAllowance + (additionalExemptionMur ?? 0)

  const taxableIncome = Math.max(0, annualSalaryMur - totalAllowance)

  if (taxableIncome <= 0) return 0

  let tax = 0
  // Band 1: 0–30,000 above threshold → 10%
  const band1 = Math.min(taxableIncome, 30_000)
  tax += band1 * 0.10

  // Band 2: above 30,000 → 15%
  const band2 = Math.max(0, taxableIncome - 30_000)
  tax += band2 * 0.15

  return Math.round(tax)
}

function fmt(n) {
  return n.toLocaleString('en-MU', { style: 'currency', currency: 'MUR', maximumFractionDigits: 0 })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TaxDeclarationPage() {
  const { user } = useAuth()

  // Remote state
  const [contract,     setContract]     = useState(null)
  const [existing,     setExisting]     = useState(null)
  const [loadingData,  setLoadingData]  = useState(true)
  const [loadError,    setLoadError]    = useState(false)

  // Form state
  const [selectedCat,    setSelectedCat]    = useState('')
  const [numDependants,  setNumDependants]  = useState(0)
  const [spouseEmployed, setSpouseEmployed] = useState(true)
  const [declarationDate, setDeclarationDate] = useState(
    new Date().toISOString().split('T')[0]
  )

  // Submit state
  const [submitting,  setSubmitting]  = useState(false)
  const [submitOk,    setSubmitOk]    = useState(false)
  const [submitError, setSubmitError] = useState('')

  // ── Load contract (for salary) and any existing declaration ─────────────
  useEffect(() => {
    void Promise.allSettled([
      getMyContract(),
      getMyTaxDeclaration(),
    ]).then(([contractR, declR]) => {
      if (contractR.status === 'fulfilled') setContract(contractR.value)
      if (declR.status === 'fulfilled' && declR.value) {
        const d = declR.value
        setExisting(d)
        setSelectedCat(d.declaration_category ?? '')
        setNumDependants(d.num_dependants ?? 0)
        setSpouseEmployed(d.spouse_employed ?? true)
        setDeclarationDate(d.declaration_date ?? new Date().toISOString().split('T')[0])
      }
    }).catch(() => setLoadError(true))
     .finally(() => setLoadingData(false))
  }, [])

  // ── Derived values ────────────────────────────────────────────────────────
  const monthlyGross   = contract?.basic_salary_mur ?? 0
  const annualGross    = monthlyGross * 12
  const catConfig      = CATEGORIES.find((c) => c.code === selectedCat)
  const payeAnnual     = catConfig
    ? estimatePAYE(annualGross, catConfig.exemption_mur)
    : null
  const payeMonthly    = payeAnnual !== null ? Math.round(payeAnnual / 12) : null

  // ── Submission ────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedCat) { setSubmitError('Please select a category.'); return }
    setSubmitting(true)
    setSubmitError('')
    setSubmitOk(false)
    try {
      await submitTaxDeclaration({
        declaration_category: selectedCat,
        num_dependants:        numDependants,
        spouse_employed:       spouseEmployed,
        declaration_date:      declarationDate,
      })
      setSubmitOk(true)
      setExisting({ declaration_category: selectedCat, num_dependants: numDependants })
    } catch (err) {
      setSubmitError(
        err?.response?.data?.message || 'Submission failed. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            MRA Employee Declaration Form
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Mauritius Revenue Authority — PAYE tax category declaration
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full flex-shrink-0"
             style={{ backgroundColor: '#1e3a5f18' }}>
          <Calculator className="h-6 w-6" style={{ color: '#1e3a5f' }} />
        </div>
      </div>

      {/* Info banner */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <p className="text-sm text-blue-800">
          Your HR department requires this declaration to deduct the correct PAYE tax from your salary each month.
          Select the category that best describes your personal circumstances. If you are unsure, consult the{' '}
          <a
            href="https://www.mra.mu"
            target="_blank"
            rel="noreferrer"
            className="underline font-medium"
          >
            MRA website
          </a>
          {' '}or your line manager.
        </p>
      </div>

      {loadingData ? (
        <div className="rounded-xl bg-white px-6 py-12 text-center text-sm text-slate-400 animate-pulse shadow-sm ring-1 ring-slate-200">
          Loading your details…
        </div>
      ) : loadError ? (
        <div className="rounded-xl bg-white px-6 py-8 text-center text-sm text-red-500 shadow-sm ring-1 ring-slate-200">
          Unable to load your details. Please refresh the page and try again.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* ── Main form ── */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-2 space-y-6"
          >
            {/* Existing declaration notice */}
            {existing && !submitOk && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p className="text-sm text-amber-800">
                  A declaration was already submitted for <strong>Category {existing.declaration_category}</strong>.
                  You may update it below — the new submission will replace the previous one.
                </p>
              </div>
            )}

            {/* Submit success notice */}
            {submitOk && (
              <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600" />
                <p className="text-sm font-medium text-green-800">
                  Declaration submitted successfully. Your HR team will be notified.
                </p>
              </div>
            )}

            {/* Category selection */}
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-800">Step 1 — Select Your Tax Category</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Choose the category that matches your marital status and family circumstances.
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {CATEGORIES.map((cat) => (
                  <label
                    key={cat.code}
                    className={`flex cursor-pointer items-start gap-4 px-5 py-4 transition-colors
                      ${selectedCat === cat.code
                        ? 'bg-blue-50'
                        : 'hover:bg-slate-50/60'
                      }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={cat.code}
                      checked={selectedCat === cat.code}
                      onChange={() => setSelectedCat(cat.code)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{cat.label}</span>
                        {cat.exemption_mur > 0 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            +{fmt(cat.exemption_mur)} exemption
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{cat.description}</p>
                    </div>
                    {selectedCat === cat.code && (
                      <ChevronRight className="ml-auto mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Additional details */}
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-800">Step 2 — Additional Details</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2">
                {/* Number of dependants */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Number of Dependent Children
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={numDependants}
                    onChange={(e) => setNumDependants(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Spouse employment status */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Spouse / Partner Employment Status
                  </label>
                  <select
                    value={spouseEmployed ? 'yes' : 'no'}
                    onChange={(e) => setSpouseEmployed(e.target.value === 'yes')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="yes">Employed / earns independent income</option>
                    <option value="no">Not employed / no independent income</option>
                  </select>
                </div>

                {/* Declaration date */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Declaration Date
                  </label>
                  <input
                    type="date"
                    value={declarationDate}
                    onChange={(e) => setDeclarationDate(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Submit button */}
            {submitError && (
              <p className="text-sm text-red-600">{submitError}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!selectedCat || submitting}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white
                           transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                <Save className="h-4 w-4" />
                {submitting ? 'Submitting…' : 'Submit Declaration'}
              </button>
            </div>
          </form>

          {/* ── PAYE Estimate sidebar ── */}
          <div className="space-y-4">
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden sticky top-20">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-800">PAYE Estimate</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Illustrative calculation based on your contracted salary and selected category.
                  Actual deductions are determined by your employer's payroll team.
                </p>
              </div>
              <div className="px-5 py-4 space-y-3">
                {/* Gross salary row */}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Monthly Gross Salary</span>
                  <span className="font-medium text-slate-800">
                    {monthlyGross > 0 ? fmt(monthlyGross) : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Annual Gross</span>
                  <span className="font-medium text-slate-800">
                    {annualGross > 0 ? fmt(annualGross) : '—'}
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-3" />

                {/* Allowances */}
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Base Personal Allowance</span>
                  <span className="font-medium text-slate-800">{fmt(390_000)}</span>
                </div>
                {catConfig && catConfig.exemption_mur > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Category {catConfig.code} Additional</span>
                    <span className="font-medium text-slate-800">{fmt(catConfig.exemption_mur)}</span>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-3" />

                {/* Estimated PAYE */}
                {payeAnnual !== null ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Estimated PAYE (Annual)</span>
                      <span className="font-semibold" style={{ color: '#1e3a5f' }}>{fmt(payeAnnual)}</span>
                    </div>
                    <div
                      className="flex justify-between rounded-lg px-3 py-2 text-sm font-semibold"
                      style={{ backgroundColor: '#1e3a5f0d', color: '#1e3a5f' }}
                    >
                      <span>Est. PAYE / Month</span>
                      <span>{fmt(payeMonthly)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Select a category to see your estimate.
                  </p>
                )}

                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  * This estimate uses simplified MRA band rates (FY 2024–2025) and does not account for
                  personal reliefs, NPF/NSF contributions, or deductible expenses. It is for guidance only.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
