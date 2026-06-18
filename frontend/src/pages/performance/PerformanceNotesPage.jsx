// =============================================================================
// src/pages/performance/PerformanceNotesPage.jsx
// HR Admin and Line Manager can create, view, edit and delete performance notes
// for employees within their scope.
// FR-12 | NFR-03 | Objective 2
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getMyTeam } from '@/api/evaluationApi'
import { getEmployees } from '@/api/employeeApi'
import {
  createNote,
  getNotesByProfile,
  updateNote,
  deleteNote,
} from '@/api/performanceNoteApi'
import {
  StickyNote,
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from 'lucide-react'

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function PerformanceNotesPage() {
  const { user } = useAuth()

  // Employee list for the selector
  const [employees, setEmployees]         = useState([])
  const [empLoading, setEmpLoading]       = useState(true)
  const [empError, setEmpError]           = useState(null)

  // Selected employee
  const [selectedProfile, setSelectedProfile] = useState(null)

  // Notes for the selected employee
  const [notes, setNotes]             = useState([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesError, setNotesError]     = useState(null)

  // Add note form
  const [newText, setNewText]   = useState('')
  const [addError, setAddError] = useState(null)
  const [adding, setAdding]     = useState(false)

  // Edit state
  const [editingId, setEditingId]   = useState(null)
  const [editText, setEditText]     = useState('')
  const [editError, setEditError]   = useState(null)
  const [saving, setSaving]         = useState(false)

  // Delete confirm
  const [deletingId, setDeletingId] = useState(null)

  // ── Load employee list ─────────────────────────────────────────────────────
  useEffect(() => {
    setEmpLoading(true)
    const fetcher =
      user?.role === 'LINE_MANAGER' ? getMyTeam() : getEmployees()

    fetcher
      .then((data) => {
        // Normalise: both endpoints return profile-like objects with user nested
        const rows = (data || []).map((p) => ({
          profile_id: p.profile_id,
          name: `${p.user?.first_name ?? p.first_name ?? ''} ${p.user?.last_name ?? p.last_name ?? ''}`.trim(),
          jobTitle: p.job_title || '—',
        }))
        setEmployees(rows)
      })
      .catch(() => setEmpError('Failed to load employee list.'))
      .finally(() => setEmpLoading(false))
  }, [user?.role])

  // ── Load notes when an employee is selected ────────────────────────────────
  const loadNotes = (profileId) => {
    setNotesLoading(true)
    setNotesError(null)
    getNotesByProfile(profileId)
      .then((data) => setNotes(data || []))
      .catch(() => setNotesError('Failed to load performance notes.'))
      .finally(() => setNotesLoading(false))
  }

  const handleSelectEmployee = (profile) => {
    setSelectedProfile(profile)
    setNewText('')
    setAddError(null)
    setEditingId(null)
    setDeletingId(null)
    loadNotes(profile.profile_id)
  }

  // ── Add note ──────────────────────────────────────────────────────────────
  const handleAddNote = async () => {
    if (!newText.trim()) {
      setAddError('Note text cannot be empty.')
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const created = await createNote({
        profile_id: selectedProfile.profile_id,
        note_text: newText.trim(),
      })
      setNotes((prev) => [created, ...prev])
      setNewText('')
    } catch {
      setAddError('Failed to add note. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  // ── Edit note ─────────────────────────────────────────────────────────────
  const startEdit = (note) => {
    setEditingId(note.note_id)
    setEditText(note.note_text)
    setEditError(null)
    setDeletingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!editText.trim()) {
      setEditError('Note text cannot be empty.')
      return
    }
    setSaving(true)
    setEditError(null)
    try {
      const updated = await updateNote(editingId, editText.trim())
      setNotes((prev) =>
        prev.map((n) => (n.note_id === editingId ? { ...n, note_text: updated?.note_text ?? editText.trim() } : n))
      )
      setEditingId(null)
    } catch {
      setEditError('Failed to save note. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete note ───────────────────────────────────────────────────────────
  const handleDelete = async (noteId) => {
    try {
      await deleteNote(noteId)
      setNotes((prev) => prev.filter((n) => n.note_id !== noteId))
      setDeletingId(null)
    } catch {
      // Silently reset confirm state — error feedback in production would use a toast
      setDeletingId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      {/* Page header */}
      <div className="mb-6 flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: '#e8f0fb' }}
        >
          <StickyNote className="h-5 w-5" style={{ color: '#1e3a5f' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
            Performance Notes
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Record and manage performance notes for employees during their probation period.
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── Left: Employee selector ─────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0">
          <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Select Employee
              </p>
            </div>

            {empLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : empError ? (
              <div className="px-4 py-3 text-sm text-red-600">{empError}</div>
            ) : employees.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                No employees found.
              </div>
            ) : (
              <ul className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
                {employees.map((emp) => (
                  <li key={emp.profile_id}>
                    <button
                      onClick={() => handleSelectEmployee(emp)}
                      className={[
                        'w-full text-left px-4 py-3 text-sm transition-colors',
                        selectedProfile?.profile_id === emp.profile_id
                          ? 'font-semibold text-white'
                          : 'text-slate-700 hover:bg-slate-50',
                      ].join(' ')}
                      style={
                        selectedProfile?.profile_id === emp.profile_id
                          ? { backgroundColor: '#1e3a5f' }
                          : {}
                      }
                    >
                      <span className="block font-medium">{emp.name}</span>
                      <span
                        className={[
                          'block text-xs mt-0.5',
                          selectedProfile?.profile_id === emp.profile_id
                            ? 'text-white/70'
                            : 'text-slate-400',
                        ].join(' ')}
                      >
                        {emp.jobTitle}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Right: Notes panel ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selectedProfile ? (
            <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-slate-200">
              <StickyNote className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">
                Select an employee on the left to view or add performance notes.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add note form */}
              <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-5">
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  Add Note for {selectedProfile.name}
                </p>
                <textarea
                  value={newText}
                  onChange={(e) => { setNewText(e.target.value); setAddError(null) }}
                  rows={3}
                  placeholder="Enter a performance note…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                />
                {addError && (
                  <p className="mt-1 text-xs text-red-600">{addError}</p>
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={handleAddNote}
                    disabled={adding}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 transition-opacity"
                    style={{ backgroundColor: '#1e3a5f' }}
                  >
                    {adding ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add Note
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {notesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                </div>
              ) : notesError ? (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-4 w-4" /> {notesError}
                </div>
              ) : notes.length === 0 ? (
                <div className="rounded-xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200">
                  <StickyNote className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  <p className="text-sm text-slate-400">No performance notes yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div
                      key={note.note_id}
                      className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-5"
                    >
                      {editingId === note.note_id ? (
                        // Edit mode
                        <div>
                          <textarea
                            value={editText}
                            onChange={(e) => { setEditText(e.target.value); setEditError(null) }}
                            rows={3}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                          />
                          {editError && (
                            <p className="mt-1 text-xs text-red-600">{editError}</p>
                          )}
                          <div className="mt-2 flex items-center gap-2 justify-end">
                            <button
                              onClick={cancelEdit}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 transition-opacity"
                              style={{ backgroundColor: '#1e3a5f' }}
                            >
                              {saving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {note.note_text}
                          </p>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              {note.recorder
                                ? `${note.recorder.first_name} ${note.recorder.last_name}`
                                : 'Unknown'}{' '}
                              · {fmtDate(note.created_at)}
                            </span>

                            {/* Only show actions if caller is HR or the note's author */}
                            {(user?.role === 'HR_ADMIN' || note.recorder?.user_id === user?.user_id) && (
                              <div className="flex items-center gap-1">
                                {deletingId === note.note_id ? (
                                  <>
                                    <span className="text-xs text-slate-500 mr-1">Delete?</span>
                                    <button
                                      onClick={() => handleDelete(note.note_id)}
                                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                      <Check className="h-3 w-3" /> Yes
                                    </button>
                                    <button
                                      onClick={() => setDeletingId(null)}
                                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                                    >
                                      <X className="h-3 w-3" /> No
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => startEdit(note)}
                                      className="rounded p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                      title="Edit note"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => { setDeletingId(note.note_id); setEditingId(null) }}
                                      className="rounded p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                      title="Delete note"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
