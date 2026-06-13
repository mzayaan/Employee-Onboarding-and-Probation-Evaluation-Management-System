// =============================================================================
// src/pages/employee/documents/MyDocumentsPage.jsx
// Employee views their submitted onboarding documents and their review status.
// FR-05, FR-06 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { getMyDocuments } from '@/api/documentApi'
import {
  FileText, UploadCloud, Loader2, AlertCircle,
  CheckCircle, Clock, XCircle, ExternalLink,
} from 'lucide-react'

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending Review', icon: Clock,         bg: '#fef3c7', color: '#b45309' },
  APPROVED: { label: 'Approved',       icon: CheckCircle,   bg: '#dcfce7', color: '#15803d' },
  REJECTED: { label: 'Rejected',       icon: XCircle,       bg: '#fee2e2', color: '#b91c1c' },
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function MyDocumentsPage() {
  const navigate = useNavigate()
  const [docs,    setDocs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getMyDocuments()
      .then(setDocs)
      .catch(() => setError('Failed to load your documents.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>My Documents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track your onboarding document submissions and HR review status.
          </p>
        </div>
        <button
          onClick={() => navigate('/employee/documents/upload')}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          <UploadCloud className="h-4 w-4" />
          Upload Document
        </button>
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
          <p className="mt-3 text-sm font-medium text-slate-500">
            You have not submitted any documents yet.
          </p>
          <button
            onClick={() => navigate('/employee/documents/upload')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            <UploadCloud className="h-4 w-4" />
            Upload Your First Document
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map((doc) => {
            const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.PENDING
            const StatusIcon = cfg.icon
            return (
              <div
                key={doc.document_id}
                className="rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left */}
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {doc.documentType?.name ?? 'Unknown Type'}
                        {doc.documentType?.is_required && (
                          <span className="ml-1.5 text-xs font-normal text-slate-400">(Required)</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {doc.original_filename} · {formatBytes(doc.file_size)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Uploaded {formatDate(doc.uploaded_at)}
                        {doc.reviewed_at && ` · Reviewed ${formatDate(doc.reviewed_at)}`}
                      </p>
                    </div>
                  </div>

                  {/* Right — status badge + view link */}
                  <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                    <a
                      href={`http://localhost:5000/api/documents/${doc.document_id}/view?token=${localStorage.getItem('token')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View file
                    </a>
                  </div>
                </div>

                {/* Rejection feedback */}
                {doc.status === 'REJECTED' && doc.feedback && (
                  <div className="mt-4 rounded-lg bg-red-50 px-4 py-3">
                    <p className="text-xs font-semibold text-red-700 mb-1">HR Feedback:</p>
                    <p className="text-xs text-red-600">{doc.feedback}</p>
                    <button
                      onClick={() => navigate('/employee/documents/upload')}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                      style={{ backgroundColor: '#b91c1c' }}
                    >
                      <UploadCloud className="h-3 w-3" />
                      Re-upload
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
