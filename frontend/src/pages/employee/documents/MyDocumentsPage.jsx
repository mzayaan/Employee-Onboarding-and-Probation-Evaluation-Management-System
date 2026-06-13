// =============================================================================
// src/pages/employee/documents/MyDocumentsPage.jsx
// Employee views all document types and uploads onboarding documents.
// Combined layout matching Figma 12:35: left doc list + right upload panel.
// FR-05, FR-06 | NFR-02, NFR-03 | Objective 1
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { getMyDocuments, getDocumentTypes, uploadDocument } from '@/api/documentApi'
import {
  FileText, UploadCloud, CheckCircle, Clock, XCircle,
  Loader2, AlertCircle, ExternalLink,
} from 'lucide-react'

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending Review', icon: Clock,       bg: '#fef3c7', color: '#b45309' },
  APPROVED: { label: 'Approved',       icon: CheckCircle, bg: '#dcfce7', color: '#15803d' },
  REJECTED: { label: 'Rejected',       icon: XCircle,     bg: '#fee2e2', color: '#b91c1c' },
}

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.docx'
const MAX_MB   = 5

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function MyDocumentsPage() {
  const fileRef = useRef(null)

  const [docTypes,     setDocTypes]     = useState([])
  const [submitted,    setSubmitted]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [selectedType, setSelectedType] = useState(null)
  const [file,         setFile]         = useState(null)
  const [dragging,     setDragging]     = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [uploadError,  setUploadError]  = useState('')
  const [uploadSuccess,setUploadSuccess]= useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([getDocumentTypes(), getMyDocuments()])
      .then(([types, docs]) => { setDocTypes(types); setSubmitted(docs) })
      .catch(() => setError('Failed to load documents.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const submissionMap = Object.fromEntries(submitted.map((d) => [d.document_type_id, d]))

  const handleFileChange = (f) => {
    if (!f) return
    const allowed = [
      'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!allowed.includes(f.type)) { setUploadError('Only PDF, JPG, PNG and DOCX files are accepted.'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setUploadError(`File must be smaller than ${MAX_MB} MB.`); return }
    setFile(f)
    setUploadError('')
  }

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); handleFileChange(e.dataTransfer.files[0]) }

  const handleUpload = async () => {
    if (!selectedType) { setUploadError('Select a document type from the left.'); return }
    if (!file)         { setUploadError('Select a file to upload.'); return }
    setUploading(true); setUploadError('')
    try {
      const fd = new FormData()
      fd.append('document_type_id', selectedType.type_id)
      fd.append('document', file)
      await uploadDocument(fd)
      setUploadSuccess(true); setFile(null); setSelectedType(null); load()
      setTimeout(() => setUploadSuccess(false), 3000)
    } catch (err) {
      setUploadError(err.response?.data?.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const selectForUpload = (dt) => {
    setSelectedType(dt); setFile(null); setUploadError(''); setUploadSuccess(false)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>My Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit your onboarding documents and track their review status.
        </p>
      </div>

      <div className="flex gap-6 items-start">

        {/* Left — document type list */}
        <div className="w-80 flex-shrink-0 rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Required Documents</h2>
            <p className="mt-0.5 text-xs text-slate-400">Click a document to upload or re-upload</p>
          </div>
          <div className="divide-y divide-slate-50">
            {docTypes.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-400">No document types configured.</p>
            ) : (
              docTypes.map((dt) => {
                const sub        = submissionMap[dt.type_id]
                const cfg        = sub ? (STATUS_CONFIG[sub.status] || STATUS_CONFIG.PENDING) : null
                const Icon       = cfg?.icon ?? FileText
                const isSelected = selectedType?.type_id === dt.type_id

                return (
                  <div
                    key={dt.type_id}
                    onClick={() => selectForUpload(dt)}
                    className={`flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                      style={cfg ? { backgroundColor: cfg.bg } : { backgroundColor: '#f1f5f9' }}
                    >
                      <Icon className="h-4 w-4" style={cfg ? { color: cfg.color } : { color: '#94a3b8' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {dt.name}
                        {dt.is_required && <span className="ml-1 text-red-400">*</span>}
                      </p>
                      {sub ? (
                        <p className="text-xs mt-0.5" style={{ color: cfg?.color }}>{cfg?.label} · {formatDate(sub.uploaded_at)}</p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">Not submitted</p>
                      )}
                    </div>
                    <span
                      className="flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-medium"
                      style={
                        sub?.status === 'APPROVED'
                          ? { backgroundColor: '#dcfce7', color: '#15803d' }
                          : { backgroundColor: '#e8edf5', color: '#1e3a5f' }
                      }
                    >
                      {sub?.status === 'APPROVED' ? 'Done' : sub ? 'Re-upload' : 'Upload'}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right — upload panel */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Drop zone card */}
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800">
                {selectedType ? `Upload: ${selectedType.name}` : 'Select a document type to upload'}
              </h2>
              {selectedType && (
                <p className="mt-0.5 text-xs text-slate-400">Accepted: PDF, JPG, PNG, DOCX — max {MAX_MB} MB</p>
              )}
            </div>
            <div className="px-6 py-6">
              {!selectedType ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-16">
                  <FileText className="h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-400">Select a document type from the left to begin</p>
                </div>
              ) : (
                <>
                  {uploadSuccess && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                      Document uploaded successfully and is pending HR review.
                    </div>
                  )}
                  {uploadError && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" /> {uploadError}
                    </div>
                  )}
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 cursor-pointer transition-colors ${
                      dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {file ? (
                      <>
                        <FileText className="h-10 w-10 text-blue-500 mb-2" />
                        <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatBytes(file.size)}</p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFile(null) }}
                          className="mt-3 text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-10 w-10 text-slate-300 mb-2" />
                        <p className="text-sm font-medium text-slate-600">Drag and drop a file here</p>
                        <p className="text-xs text-slate-400 mt-0.5">or click to browse</p>
                      </>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={(e) => handleFileChange(e.target.files[0])} />

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={handleUpload}
                      disabled={uploading || !file}
                      className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                      style={{ backgroundColor: '#1e3a5f' }}
                    >
                      {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><UploadCloud className="h-4 w-4" /> Upload Document</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedType(null); setFile(null); setUploadError('') }}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Upload progress — submitted docs */}
          {submitted.length > 0 && (
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="text-sm font-semibold text-slate-800">Upload Progress</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {submitted.filter((d) => d.status === 'APPROVED').length} of {docTypes.filter((d) => d.is_required).length} required documents approved
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {submitted.map((doc) => {
                  const cfg  = STATUS_CONFIG[doc.status] || STATUS_CONFIG.PENDING
                  const Icon = cfg.icon
                  return (
                    <div key={doc.document_id} className="flex items-center gap-4 px-6 py-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: cfg.bg }}>
                        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{doc.documentType?.name ?? 'Document'}</p>
                        <p className="text-xs text-slate-400">{doc.original_filename} · {formatBytes(doc.file_size)}</p>
                        {doc.status === 'REJECTED' && doc.feedback && (
                          <p className="text-xs text-red-500 mt-0.5 truncate" title={doc.feedback}>HR: {doc.feedback}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        <a
                          href={`http://localhost:5000/api/documents/${doc.document_id}/view?token=${localStorage.getItem('token')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </AppShell>
  )
}
