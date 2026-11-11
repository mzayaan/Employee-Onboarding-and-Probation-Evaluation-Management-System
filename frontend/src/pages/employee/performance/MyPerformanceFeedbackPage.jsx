// =============================================================================
// src/pages/employee/performance/MyPerformanceFeedbackPage.jsx
// Employee view: see all performance notes on their own record,
// add their own EMPLOYEE_FEEDBACK notes, and respond to manager notes.
// FR-12 | NFR-03 | Objective 2 | NEW_EMPLOYEE
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  getMyNotes,
  addEmployeeFeedback,
  respondToNote,
} from '@/api/performanceNoteApi'
import {
  StickyNote, Loader2, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, PlusCircle, MessageSquare,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const CATEGORY_LABEL = {
  GENERAL:             { label: 'General',           bg: '#f1f5f9', text: '#475569' },
  PERFORMANCE:         { label: 'Performance',        bg: '#eff6ff', text: '#1d4ed8' },
  ATTENDANCE:          { label: 'Attendance',         bg: '#fef9c3', text: '#854d0e' },
  CONDUCT:             { label: 'Conduct',            bg: '#fff7ed', text: '#c2410c' },
  ACHIEVEMENT:         { label: 'Achievement',        bg: '#f0fdf4', text: '#166534' },
  CONCERN:             { label: 'Concern',            bg: '#fef2f2', text: '#991b1b' },
  EMPLOYEE_FEEDBACK:   { label: 'My Feedback',        bg: '#fdf4ff', text: '#7e22ce' },
}

function CategoryBadge({ category }) {
  const c = CATEGORY_LABEL[category] || CATEGORY_LABEL.GENERAL
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  )
}

function RatingStars({ rating }) {
  if (!rating) return null
  return (
    <span className="text-sm text-amber-500">
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
      <span className="ml-1 text-xs text-slate-400">{rating}/5</span>
    </span>
  )
}

// ── Single note card ──────────────────────────────────────────────────────────
function NoteCard({ note, onRespond }) {
  const [expanded,  setExpanded]  = useState(false)
  const [response,  setResponse]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [saved,     setSaved]     = useState(false)

  const isOwnFeedback = note.note_category === 'EMPLOYEE_FEEDBACK'
  const recorder      = note.recorder
    ? `${note.recorder.first_name} ${note.recorder.last_name}`
    : isOwnFeedback ? 'You' : 'HR / Manager'

  const handleRespond = async () => {
    if (!response.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onRespond(note.note_id, response.trim())
      setSaved(true)
      setResponse('')
    } catch {
      setError('Failed to save response. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3">
          <StickyNote className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-slate-800 line-clamp-1">
              {note.note_text?.slice(0, 80)}{note.note_text?.length > 80 ? '…' : ''}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isOwnFeedback ? 'You submitted this' : `By ${recorder}`}
              {' · '}{fmtDate(note.created_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <CategoryBadge category={note.note_category} />
          {note.employee_response && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Responded
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
          {/* Note body */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Note</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.note_text}</p>
          </div>

          {/* KPI fields */}
          {(note.kpi_target || note.kpi_achievement || note.kpi_rating) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
              {note.kpi_target && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-0.5">KPI Target</p>
                  <p className="text-sm text-slate-700">{note.kpi_target}</p>
                </div>
              )}
              {note.kpi_achievement && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Achievement</p>
                  <p className="text-sm text-slate-700">{note.kpi_achievement}</p>
                </div>
              )}
              {note.kpi_rating && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Rating</p>
                  <RatingStars rating={note.kpi_rating} />
                </div>
              )}
            </div>
          )}

          {/* Existing employee response */}
          {note.employee_response && (
            <div className="rounded-lg bg-purple-50 p-3 ring-1 ring-purple-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-400 mb-1">Your Response</p>
              <p className="text-sm text-purple-800 whitespace-pre-wrap">{note.employee_response}</p>
            </div>
          )}

          {/* Add / update response — only on manager notes, not own feedback */}
          {!isOwnFeedback && (
            <div className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="mb-2 text-sm font-medium text-slate-700">
                {note.employee_response ? 'Update your response' : 'Add your response'}
              </p>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={3}
                placeholder="Share your perspective on this note…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={handleRespond}
                  disabled={saving || !response.trim()}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Save Response'}
                </button>
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Saved
                  </span>
                )}
              </div>
              {error && (
                <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" /> {error}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add Feedback form ─────────────────────────────────────────────────────────
function AddFeedbackForm({ onSubmit }) {
  const [text,    setText]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [success, setSuccess] = useState(false)
  const [open,    setOpen]    = useState(false)

  const handleSubmit = async () => {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await onSubmit(text.trim())
      setText('')
      setSuccess(true)
      setTimeout(() => { setOpen(false); setSuccess(false) }, 1500)
    } catch {
      setError('Failed to submit feedback. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm"
        style={{ backgroundColor: '#1e3a5f' }}
      >
        <PlusCircle className="h-4 w-4" />
        Add My Feedback
      </button>
    )
  }

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-purple-200 p-5">
      <p className="mb-3 text-sm font-semibold text-slate-800 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-purple-500" />
        Add Your Feedback
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Share how you feel your probation is progressing, any support you need, or anything else you'd like HR / your manager to know…"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 resize-none"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving || !text.trim()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
          style={{ backgroundColor: '#7e22ce' }}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Submitting…' : 'Submit Feedback'}
        </button>
        <button
          onClick={() => { setOpen(false); setText(''); setError(null) }}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
        >
          Cancel
        </button>
        {success && (
          <span className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="h-3 w-3" /> Submitted
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyPerformanceFeedbackPage() {
  const [notes,   setNotes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const loadNotes = () => {
    setLoading(true)
    getMyNotes()
      .then(setNotes)
      .catch(() => setError('Failed to load your performance notes.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadNotes() }, [])

  const handleFeedbackSubmit = async (text) => {
    await addEmployeeFeedback(text)
    loadNotes()
  }

  const handleRespond = async (noteId, response) => {
    const updated = await respondToNote(noteId, response)
    setNotes((prev) => prev.map((n) => (n.note_id === noteId ? updated : n)))
  }

  // Split into manager/HR notes and own feedback
  const managerNotes = notes.filter((n) => n.note_category !== 'EMPLOYEE_FEEDBACK')
  const myFeedback   = notes.filter((n) => n.note_category === 'EMPLOYEE_FEEDBACK')
  const pendingReply = managerNotes.filter((n) => !n.employee_response).length

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            My Performance Feedback
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            View notes recorded by HR and your manager, add your own feedback, and respond to individual notes.
          </p>
        </div>
        {!loading && !error && <AddFeedbackForm onSubmit={handleFeedbackSubmit} />}
      </div>

      {/* Loading / error states */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary banner */}
          {notes.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800">{notes.length}</p>
                <p className="text-xs text-slate-400">Total Notes</p>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div className="text-center">
                <p className="text-lg font-bold text-slate-800">{managerNotes.length}</p>
                <p className="text-xs text-slate-400">From Manager / HR</p>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              {pendingReply > 0 && (
                <>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{pendingReply}</p>
                    <p className="text-xs text-slate-400">Awaiting Your Response</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                </>
              )}
              <div className="text-center">
                <p className="text-lg font-bold text-purple-700">{myFeedback.length}</p>
                <p className="text-xs text-slate-400">My Feedback</p>
              </div>
            </div>
          )}

          {/* Notes from manager / HR */}
          {managerNotes.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Notes from Manager / HR
              </h2>
              <div className="space-y-3">
                {managerNotes.map((n) => (
                  <NoteCard key={n.note_id} note={n} onRespond={handleRespond} />
                ))}
              </div>
            </section>
          )}

          {/* My feedback submissions */}
          {myFeedback.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                My Feedback Submissions
              </h2>
              <div className="space-y-3">
                {myFeedback.map((n) => (
                  <NoteCard key={n.note_id} note={n} onRespond={handleRespond} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {notes.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
              <StickyNote className="mb-3 h-8 w-8 text-slate-200" />
              <p className="text-sm font-medium text-slate-500">No performance notes yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Notes from your manager or HR will appear here. You can also add your own feedback above.
              </p>
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
