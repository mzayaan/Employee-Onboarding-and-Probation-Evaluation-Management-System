// =============================================================================
// src/pages/hr/documents/DocumentReviewPage.jsx
// HR reviews, approves or rejects employee onboarding documents.
// Two-panel layout matching Figma 12:27.
// FR-06, FR-09, FR-18 | NFR-02, NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getAllDocuments, verifyDocument, openDocumentInTab } from '@/api/documentApi'
import {
  FileText, CheckCircle, XCircle, Clock,
  Loader2, AlertCircle, ExternalLink,
} from 'lucide-react'

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  icon: Clock,         bg: '#fef3c7', color: '#b45309' },
  APPROVED: { label: 'Approved', icon: CheckCircle,   bg: '#dcfce7', color: '#15803d' },
  REJECTED: { label: 'Rejected', icon: XCircle,       bg: '#fee2e2', color: '#b91c1c' },
}

const TABS = [
  { key: '',         label: 'All' },
  { key: 'PENDING',  label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
]

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function DocumentReviewPage() {
  const [docs,         setDocs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [selected,     setSelected]     = useState(null)

  // Right-panel review state
  const [decision,    setDecision]    = useState('APPROVED')
  const [feedback,    setFeedback]    = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewSuccess, setReviewSuccess] = useState(false)

  const fetchDocs = (status) => {
    setLoading(true)
    setError(null)
    getAllDocuments(status)
      .then(setDocs)
      .catch(() => setError('Failed to load documents.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchDocs(statusFilter) }, [statusFilter])

  const selectDoc = (doc) => {
    setSelected(doc)
    setDecision('APPROVED')
    setFeedback('')
    setReviewError('')
    setReviewSuccess(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (decision === 'REJECTED' && !feedback.trim()) {
      setReviewError('Feedback is required when rejecting a document.')
      return
    }
    setSubmitting(true)
    setReviewError('')
    try {
      await verifyDocument(selected.document_id, {
        status: decision,
        feedback: decision === 'REJECTED' ? feedback.trim() : '',
      })
      setReviewSuccess(true)
      setTimeout(() => {
        setSelected(null)
        setReviewSuccess(false)
        fetchDocs(statusFilter)
      }, 1200)
    } catch (err) {
      setReviewError(err.response?.data?.message || 'Failed to save decision.')
      setSubmitting(false)
    }
  }

  const pending  = docs.filter((d) => d.status === 'PENDING').length
  const approved = docs.filter((d) => d.status === 'APPROVED').length
  const rejected = docs.filter((d) => d.status === 'REJECTED').length

  return (
    <AppShell>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Document Review</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review and verify onboarding documents submitted by employees.
        </p>
      </div>

      {/* Summary chips */}
      <div className="mb-5 flex gap-3">
        {[
          { label: 'Pending',  count: pending,  bg: '#fef3c7', color: '#b45309' },
          { label: 'Approved', count: approved, bg: '#dcfce7', color: '#15803d' },
          { label: 'Rejected', count: rejected, bg: '#fee2e2', color: '#b91c1c' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium"
               style={{ backgroundColor: s.bg, color: s.color }}>
            <span className="text-lg font-bold">{s.count}</span>
            {s.label}
          </div>
        ))}
      </div>

      {/* Two-panel layout */}
      <div className="flex gap-6 items-start min-h-[520px]">

        {/* Left: document list */}
        <div className="w-96 flex-shrink-0 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden flex flex-col">
          {/* Filter tabs */}
          <div className="flex border-b border-slate-100">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setStatusFilter(tab.key); setSelected(null) }}
                className={`flex-1 py-3 text-xs font-medium transition-colors ${
                  statusFilter === tab.key
                    ? 'border-b-2 text-blue-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                style={statusFilter === tab.key ? { borderBottomColor: '#1e3a5f', color: '#1e3a5f' } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Doc list body */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 px-4 py-6 text-xs text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
              </div>
            ) : docs.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-slate-400">
                <FileText className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                No documents found.
              </div>
            ) : (
              docs.map((doc) => {
                const cfg      = STATUS_CONFIG[doc.status] || STATUS_CONFIG.PENDING
                const Icon     = cfg.icon
                const employee = doc.employeeProfile
                const isActive = selected?.document_id === doc.document_id
                return (
                  <div
                    key={doc.document_id}
                    onClick={() => selectDoc(doc)}
                    className={`flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors ${
                      isActive ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: cfg.bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {employee?.user?.first_name} {employee?.user?.last_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{doc.documentType?.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatDate(doc.uploaded_at)}</p>
                    </div>
                    <span
                      className="mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: review panel */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center rounded-xl bg-white px-6 py-24 shadow-sm ring-1 ring-slate-200">
              <FileText className="h-12 w-12 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">Select a document from the list to review it</p>
            </div>
          ) : (
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              {/* Review panel header */}
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">
                      {selected.documentType?.name}
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500">
                      Submitted by{' '}
                      <strong className="text-slate-700">
                        {selected.employeeProfile?.user?.first_name} {selected.employeeProfile?.user?.last_name}
                      </strong>
                      {selected.employeeProfile?.job_title && ` — ${selected.employeeProfile.job_title}`}
                    </p>
                  </div>
                  {(() => {
                    const cfg = STATUS_CONFIG[selected.status] || STATUS_CONFIG.PENDING
                    const Icon = cfg.icon
                    return (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    )
                  })()}
                </div>

                {/* File info + open link */}
                <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-slate-700">{selected.original_filename}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Uploaded {formatDate(selected.uploaded_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDocumentInTab(selected.document_id)}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 ring-1 ring-blue-200 bg-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open File
                  </button>
                </div>

                {/* Existing feedback if rejected */}
                {selected.status === 'REJECTED' && selected.feedback && (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700">
                    <strong>Previous rejection reason:</strong> {selected.feedback}
                  </div>
                )}
              </div>

              {/* Review form */}
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                {reviewSuccess && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    Decision saved successfully.
                  </div>
                )}
                {reviewError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {reviewError}
                  </div>
                )}

                {/* Decision */}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Decision</p>
                  <div className="grid grid-cols-2 gap-3">
                    {['APPROVED', 'REJECTED'].map((opt) => {
                      const cfg = STATUS_CONFIG[opt]
                      const Icon = cfg.icon
                      return (
                        <label
                          key={opt}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border-2 px-4 py-3 transition-colors ${
                            decision === opt
                              ? opt === 'APPROVED'
                                ? 'border-green-500 bg-green-50'
                                : 'border-red-500 bg-red-50'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="decision"
                            value={opt}
                            checked={decision === opt}
                            onChange={() => setDecision(opt)}
                            className="sr-only"
                          />
                          <Icon
                            className="h-4 w-4"
                            style={{ color: decision === opt ? cfg.color : '#94a3b8' }}
                          />
                          <span className="text-sm font-medium text-slate-700">{cfg.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Feedback textarea */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Feedback
                    {decision === 'REJECTED' && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <textarea
                    rows={3}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder={
                      decision === 'REJECTED'
                        ? 'Explain why the document was rejected and what should be resubmitted.'
                        : 'Optional note for the employee (leave blank if none).'
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${
                      decision === 'APPROVED'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                    ) : decision === 'APPROVED' ? (
                      <><CheckCircle className="h-4 w-4" /> Approve</>
                    ) : (
                      <><XCircle className="h-4 w-4" /> Reject</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
