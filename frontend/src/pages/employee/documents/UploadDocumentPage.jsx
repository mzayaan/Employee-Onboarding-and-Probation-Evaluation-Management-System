// =============================================================================
// src/pages/employee/documents/UploadDocumentPage.jsx
// Employee uploads a required onboarding document.
// FR-05 | NFR-02 | Objective 1
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { getDocumentTypes, uploadDocument } from '@/api/documentApi'
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.docx'

export default function UploadDocumentPage() {
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const [docTypes,    setDocTypes]    = useState([])
  const [typeId,      setTypeId]      = useState('')
  const [file,        setFile]        = useState(null)
  const [dragging,    setDragging]    = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState('')
  const [fieldErrors, setFieldErrors] = useState({})

  useEffect(() => {
    getDocumentTypes()
      .then(setDocTypes)
      .catch(() => setError('Failed to load document types.'))
  }, [])

  // ── File selection ─────────────────────────────────────────────────────────
  const handleFileChange = (selectedFile) => {
    if (!selectedFile) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(selectedFile.type)) {
      setFieldErrors((prev) => ({ ...prev, file: 'Only PDF, JPG, PNG and DOCX files are accepted.' }))
      return
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, file: 'File must be smaller than 5 MB.' }))
      return
    }
    setFile(selectedFile)
    setFieldErrors((prev) => ({ ...prev, file: '' }))
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFileChange(e.dataTransfer.files[0])
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = {}
    if (!typeId) errors.typeId = 'Please select a document type.'
    if (!file)   errors.file   = 'Please select a file to upload.'
    if (Object.keys(errors).length) { setFieldErrors(errors); return }

    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('document_type_id', typeId)
      fd.append('document', file)
      await uploadDocument(fd)
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto mt-16 rounded-xl bg-white px-8 py-10 text-center shadow-sm ring-1 ring-slate-200">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="mt-4 text-xl font-bold text-slate-800">Document Uploaded</h2>
          <p className="mt-2 text-sm text-slate-500">
            Your document has been submitted and is pending HR review.
            You will receive an email notification once it has been reviewed.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => navigate('/employee/documents')}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-white"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              View My Documents
            </button>
            <button
              onClick={() => { setSuccess(false); setFile(null); setTypeId('') }}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Upload Another
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Upload Document</h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit a required onboarding document for HR review.
          Accepted formats: PDF, JPG, PNG, DOCX — max 5 MB.
        </p>
      </div>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="rounded-xl bg-white px-8 py-8 shadow-sm ring-1 ring-slate-200 space-y-6">

          {/* Global error */}
          {error && (
            <div className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Document type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Document Type <span className="text-red-500">*</span>
            </label>
            <select
              value={typeId}
              onChange={(e) => { setTypeId(e.target.value); setFieldErrors((p) => ({ ...p, typeId: '' })) }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Select a document type…</option>
              {docTypes.map((dt) => (
                <option key={dt.type_id} value={dt.type_id}>
                  {dt.name}{dt.is_required ? ' *' : ''}
                </option>
              ))}
            </select>
            {fieldErrors.typeId && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.typeId}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">Types marked with * are required for onboarding completion.</p>
          </div>

          {/* File drop zone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              File <span className="text-red-500">*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              {file ? (
                <>
                  <FileText className="h-8 w-8 text-blue-500 mb-2" />
                  <p className="text-sm font-medium text-slate-700">{file.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
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
                  <UploadCloud className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm font-medium text-slate-600">Drag and drop a file here</p>
                  <p className="text-xs text-slate-400 mt-0.5">or click to browse</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files[0])}
            />
            {fieldErrors.file && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.file}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
              ) : (
                <><UploadCloud className="h-4 w-4" /> Upload Document</>
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/employee/documents')}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
