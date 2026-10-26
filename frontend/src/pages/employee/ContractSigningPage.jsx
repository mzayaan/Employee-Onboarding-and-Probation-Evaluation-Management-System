// =============================================================================
// src/pages/employee/ContractSigningPage.jsx
// DocuSign-Style Contract Signing Screen
//
// Allows a NEW_EMPLOYEE to:
//   1. Review their contract details in an unalterable summary card.
//   2. Confirm they have read and understood the terms.
//   3. Enter their full name as a digital signature string.
//   4. Submit — the backend captures the timestamp + client IP and marks
//      the contract as signed.
//
// WRA 2019 s.13 | FR-04 (extended) | NFR-02, NFR-08
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getMyContract, signContract } from '@/api/contractApi'
import {
  FileSignature, CheckCircle, Lock, AlertTriangle,
  Calendar, Briefcase, ClipboardList, Clock,
} from 'lucide-react'

// ── Helper: contract type label ───────────────────────────────────────────────
const CONTRACT_TYPE_LABELS = {
  INDETERMINATE: 'Indeterminate (Open-Ended)',
  PART_TIME:     'Part-Time',
  FIXED_TERM:    'Fixed-Term',
}

// ── Unalterable detail card ───────────────────────────────────────────────────
function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
           style={{ backgroundColor: '#1e3a5f12' }}>
        <Icon className="h-4 w-4" style={{ color: '#1e3a5f' }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{value || '—'}</p>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ContractSigningPage() {
  const { user } = useAuth()

  const [contract,    setContract]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState(false)
  const [notFound,    setNotFound]    = useState(false)

  // Signature form state
  const [acknowledged,   setAcknowledged]   = useState(false)
  const [signatureInput, setSignatureInput] = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [signed,         setSigned]         = useState(false)
  const [submitError,    setSubmitError]    = useState('')

  // ── Full name required for signature match ────────────────────────────────
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')

  // ── Load contract ─────────────────────────────────────────────────────────
  useEffect(() => {
    getMyContract()
      .then((data) => {
        if (!data) { setNotFound(true); return }
        setContract(data)
        if (data.signed_at) setSigned(true)
      })
      .catch((err) => {
        if (err?.response?.status === 404) setNotFound(true)
        else setLoadError(true)
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Signature validation ──────────────────────────────────────────────────
  const signatureValid =
    signatureInput.trim().toLowerCase() === fullName.toLowerCase()

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSign = async (e) => {
    e.preventDefault()
    if (!acknowledged) {
      setSubmitError('Please confirm you have read and understood the contract.')
      return
    }
    if (!signatureValid) {
      setSubmitError(`Signature must exactly match your full name: "${fullName}".`)
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      await signContract(contract.contract_id, {
        signature_string:    signatureInput.trim(),
        signature_timestamp: new Date().toISOString(),
      })
      setSigned(true)
    } catch (err) {
      setSubmitError(
        err?.response?.data?.message || 'Signing failed. Please try again.'
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
            Employment Contract
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Please review your contract details carefully before signing.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full flex-shrink-0"
             style={{ backgroundColor: '#1e3a5f18' }}>
          <FileSignature className="h-6 w-6" style={{ color: '#1e3a5f' }} />
        </div>
      </div>

      {/* ── Loading / error states ── */}
      {loading && (
        <div className="rounded-xl bg-white px-6 py-12 text-center text-sm text-slate-400 animate-pulse shadow-sm ring-1 ring-slate-200">
          Loading contract…
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-xl bg-white px-6 py-8 text-center text-sm text-red-500 shadow-sm ring-1 ring-slate-200">
          Unable to load your contract details. Please refresh and try again.
        </div>
      )}

      {!loading && notFound && (
        <div className="rounded-xl bg-white px-6 py-8 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-400" />
            <p className="text-sm font-medium text-slate-700">
              No contract has been linked to your profile yet.
            </p>
            <p className="text-xs text-slate-400 max-w-sm">
              Your HR department will notify you when your employment contract is
              ready for review and signature.
            </p>
          </div>
        </div>
      )}

      {/* ── Already signed banner ── */}
      {!loading && signed && contract && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-4">
          <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-800">
              Contract signed
            </p>
            <p className="text-xs text-green-700">
              Signed on{' '}
              {contract.signed_at
                ? new Date(contract.signed_at).toLocaleDateString('en-MU', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })
                : 'a previous date'}
              . A copy has been saved to your HR record.
            </p>
          </div>
        </div>
      )}

      {/* ── Contract review + signing panel ── */}
      {!loading && !loadError && !notFound && contract && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

          {/* Contract details card (3/5 width) */}
          <div className="lg:col-span-3">
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Contract Details</h2>
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Lock className="h-3 w-3" /> Read-only
                </span>
              </div>
              <div className="px-5 py-2">
                <DetailRow
                  icon={Briefcase}
                  label="Employee"
                  value={fullName}
                />
                <DetailRow
                  icon={ClipboardList}
                  label="Contract Reference"
                  value={contract.contract_reference}
                />
                <DetailRow
                  icon={ClipboardList}
                  label="Contract Type"
                  value={CONTRACT_TYPE_LABELS[contract.contract_type] || contract.contract_type}
                />
                <DetailRow
                  icon={Calendar}
                  label="Probation Duration"
                  value={
                    contract.probation_clause_included
                      ? `${contract.probation_duration_months ?? 3} month(s) — WRA 2019 s.13`
                      : 'No probation clause — permanent from start date'
                  }
                />
                <DetailRow
                  icon={Clock}
                  label="Notice Period"
                  value={`${contract.notice_period_days ?? 14} calendar days`}
                />
                {contract.basic_salary_mur && (
                  <DetailRow
                    icon={Briefcase}
                    label="Basic Monthly Salary"
                    value={`MUR ${Number(contract.basic_salary_mur).toLocaleString('en-MU')}`}
                  />
                )}
              </div>

              {/* Legal notice */}
              <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  This document constitutes your employment contract as issued by your employer.
                  By signing below you confirm that you have read, understood and agree to abide by
                  the terms and conditions stated. If you have any concerns, please raise them with
                  your HR representative before signing.
                </p>
              </div>
            </div>

            {/* Cloudinary PDF link (if uploaded) */}
            {contract.cloudinary_url && (
              <div className="mt-3">
                <a
                  href={contract.cloudinary_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <FileSignature className="h-4 w-4" />
                  View full contract PDF
                </a>
              </div>
            )}
          </div>

          {/* Signature panel (2/5 width) */}
          <div className="lg:col-span-2">
            {signed ? (
              <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 px-5 py-6 flex flex-col items-center gap-3 text-center">
                <CheckCircle className="h-10 w-10 text-green-500" />
                <p className="text-sm font-semibold text-slate-800">
                  Your signature has been recorded.
                </p>
                <p className="text-xs text-slate-400">
                  The signed timestamp and your digital acknowledgement have been stored securely
                  in your HR record.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSign}
                className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden"
              >
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-800">Sign Contract</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Type your full name exactly as shown to apply your digital signature.
                  </p>
                </div>
                <div className="px-5 py-4 space-y-4">

                  {/* Acknowledgement checkbox */}
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-blue-600 cursor-pointer"
                    />
                    <span className="text-xs text-slate-700 leading-relaxed">
                      I confirm that I have read and fully understood the terms and conditions
                      of my employment contract as displayed above.
                    </span>
                  </label>

                  {/* Signature input */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Full Name (digital signature)
                    </label>
                    <input
                      type="text"
                      value={signatureInput}
                      onChange={(e) => setSignatureInput(e.target.value)}
                      placeholder={fullName}
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm font-medium italic
                                  focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors
                                  ${signatureInput && !signatureValid
                                    ? 'border-red-300 bg-red-50'
                                    : signatureValid
                                    ? 'border-green-400 bg-green-50'
                                    : 'border-slate-300'
                                  }`}
                    />
                    {signatureInput && !signatureValid && (
                      <p className="mt-1 text-xs text-red-500">
                        Must match exactly: <strong>{fullName}</strong>
                      </p>
                    )}
                    {signatureValid && (
                      <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Signature matches
                      </p>
                    )}
                  </div>

                  {/* Legal statement */}
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 leading-relaxed">
                    By clicking <strong>Sign Contract</strong>, your typed name above constitutes
                    your digital signature and legally binding acceptance of the employment terms.
                    The date and time of signing will be recorded automatically.
                  </div>

                  {submitError && (
                    <p className="text-xs text-red-600">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!acknowledged || !signatureValid || submitting}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg
                               px-4 py-2.5 text-sm font-medium text-white transition-opacity
                               disabled:opacity-40"
                    style={{ backgroundColor: '#1e3a5f' }}
                  >
                    <FileSignature className="h-4 w-4" />
                    {submitting ? 'Signing…' : 'Sign Contract'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
