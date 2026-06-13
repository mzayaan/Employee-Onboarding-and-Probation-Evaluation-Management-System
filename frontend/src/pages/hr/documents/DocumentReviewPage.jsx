// =============================================================================
// src/pages/hr/documents/DocumentReviewPage.jsx
// HR reviews, approves or rejects employee onboarding documents.
// FR-06, FR-09, FR-18 | NFR-02, NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getAllDocuments, verifyDocument } from '@/api/documentApi'
import {
  FileText, CheckCircle, XCircle, Clock,
  Loader2, AlertCircle, ExternalLink, X,
} from 'lucide-react'

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  icon: Clock,         bg: '#fef3c7', color: '#b45309' },
  APPROVED: { label: 'Approved', icon: CheckCircle,   bg: '#dcfce7', color: '#15803d' },
  REJECTED: { label: 'Rejected', icon: XCircle,       bg: '#fee2e2', color: '#b91c1c' },
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Verify Modal ──────────────────────────────────────────────────────────────
function VerifyModal({ doc, onClose, onSaved }) {
  const [decision,  setDecision]  = useState('APPROVED')
  const [feedback,  setFeedback]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,     setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (decision === 'REJECTED' && !feedback.trim()) {
      setError('Feedback is required when rejecting a document.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await verifyDocument(doc.document_id, {
        status: decision,
        feedback: decision === 'REJECTED' ? feedback.trim() : '',
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save decision. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Review Document</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {doc.documentType?.name} — {doc.employeeProfile?.first_name} {doc.employeeProfile?.last_name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Document preview link */}
        <div className="px-6 py-4 border-b border-slate-100">
          <a
            href={`http://localhost:5000/api/documents/${doc.document_id}/view?token=${localStorage.getItem('token')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <ExternalLink className="h-4 w-4" />
            Open document to review
          </a>
          <p className="mt-1.5 text-xs text-slate-400">{doc.original_filename}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Decision radio group */}
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

          {/* Feedback textarea — required when rejecting */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Feedback{decision === 'REJECTED' && <span className="text-red-500 ml-1">*</span>}
            </label>
            <textarea
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={
                decision === 'REJECTED'
                  ? 'Explain why the document was rejected and what the employee should resubmit.'
                  : 'Optional note for the employee (leave blank if none).'
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>

          {/* Actions */}
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
              className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                decision === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                decision === 'APPROVED' ? 'Approve' : 'Reject'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DocumentReviewPage() {
  const [docs,        setDocs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [selected,    setSelected]    = useState(null)   // doc being reviewed

  const fetchDocs = (status) => {
    setLoading(true)
    setError(null)
    getAllDocuments(status)
      .then(setDocs)
      .catch(() => setError('Failed to load documents.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchDocs(statusFilter) }, [statusFilter])

  const handleSaved = () => {
    setSelected(null)
    fetchDocs(statusFilter)
  }

  const pending  = docs.filter((d) => d.status === 'PENDING').length
  const approved = docs.filter((d) => d.status === 'APPROVED').length
  const rejected = docs.filter((d) => d.status === 'REJECTED').length

  return (
    <AppShell>
      {/* Verify modal */}
      {selected && (
        <VerifyModal
          doc={selected}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Document Review</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review and verify onboarding documents submitted by employees.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending',  count: pending,  bg: '#fef3c7', color: '#b45309', filter: 'PENDING'  },
          { label: 'Approved', count: approved, bg: '#dcfce7', color: '#15803d', filter: 'APPROVED' },
          { label: 'Rejected', count: rejected, bg: '#fee2e2', color: '#b91c1c', filter: 'REJECTED' },
        ].map((s) => (
          <button
            key={s.filter}
            onClick={() => setStatusFilter(s.filter)}
            className={`rounded-xl px-5 py-4 text-left shadow-sm ring-1 transition-shadow ${
              statusFilter === s.filter ? 'ring-2 ring-blue-500' : 'ring-slate-200 hover:ring-slate-300'
            } bg-white`}
          >
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
          </button>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', ''].map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {f === '' ? 'All' : STATUS_CONFIG[f]?.label}
          </button>
        ))}
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
      ) : docs.length === 0 ? (
        <div className="rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-200">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-500">No documents found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Document Type</th>
                <th className="px-5 py-3">File</th>
                <th className="px-5 py-3">Uploaded</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.map((doc) => {
                const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.PENDING
                const StatusIcon = cfg.icon
                const employee = doc.employeeProfile
                return (
                  <tr key={doc.document_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800">
                        {employee?.first_name} {employee?.last_name}
                      </p>
                      <p className="text-xs text-slate-400">{employee?.job_title}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-slate-700">{doc.documentType?.name}</p>
                      {doc.documentType?.is_required && (
                        <span className="text-xs text-amber-600">Required</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <a
                        href={`http://localhost:5000/api/documents/${doc.document_id}/view?token=${localStorage.getItem('token')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="max-w-[140px] truncate">{doc.original_filename}</span>
                      </a>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(doc.uploaded_at)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                      {doc.status === 'REJECTED' && doc.feedback && (
                        <p className="mt-0.5 text-xs text-red-500 max-w-[180px] truncate" title={doc.feedback}>
                          {doc.feedback}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {doc.status === 'PENDING' ? (
                        <button
                          onClick={() => setSelected(doc)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                          style={{ backgroundColor: '#1e3a5f' }}
                        >
                          Review
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelected(doc)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Re-review
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  )
}
