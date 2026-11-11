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
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Tag,
} from 'lucide-react'

// ── KPI Category config ───────────────────────────────────────────────────────
const KPI_CATEGORIES = [
  { value: 'GENERAL',          label: 'General Note',         color: '#64748b' },
  { value: 'WORK_RELATED_KPI', label: 'Work-Related KPI',     color: '#1d4ed8' },
  { value: 'SOFT_SKILLS_KPI',  label: 'Soft Skills KPI',      color: '#7c3aed' },
  { value: 'BEHAVIORAL_KPI',   label: 'Behavioural KPI',      color: '#059669' },
  { value: 'EMPLOYEE_FEEDBACK',label: 'Employee Feedback',    color: '#d97706' },
]

const getCategoryMeta = (val) =>
  KPI_CATEGORIES.find((c) => c.value === val) || KPI_CATEGORIES[0]

// Star rating (1-5) for KPI
function KpiRatingInput({ value, onChange, disabled }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(n === value ? null : n)}
          className={`h-7 w-7 rounded text-sm font-bold transition-colors ${
            value >= n
              ? 'bg-blue-700 text-white'
              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
          } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
        >
          {n}
        </button>
      ))}
      {value && !disabled && (
        <button onClick={() => onChange(null)} className="ml-1 text-xs text-slate-400 hover:text-slate-600">
          clear
        </button>
      )}
    </div>
  )
}

const TEXTAREA_CLS = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none'

const EMPTY_NOTE_FORM = {
  note_text:         '',
  note_category:     'GENERAL',
  kpi_target:        '',
  kpi_achievement:   '',
  kpi_rating:        null,
  employee_response: '',
}

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
  const [newForm, setNewForm]   = useState(EMPTY_NOTE_FORM)
  const [addError, setAddError] = useState(null)
  const [adding, setAdding]     = useState(false)
  const setNF = (field) => (val) => setNewForm((prev) => ({ ...prev, [field]: val }))
  const setNFEvt = (field) => (e) => setNF(field)(e.target.value)

  // Edit state
  const [editingId, setEditingId]   = useState(null)
  const [editForm, setEditForm]     = useState(EMPTY_NOTE_FORM)
  const [editError, setEditError]   = useState(null)
  const [saving, setSaving]         = useState(false)
  const setEF = (field) => (val) => setEditForm((prev) => ({ ...prev, [field]: val }))
  const setEFEvt = (field) => (e) => setEF(field)(e.target.value)

  // Delete confirm
  const [deletingId, setDeletingId] = useState(null)

  // Carousel: current category index (0-4)
  const [carouselIdx, setCarouselIdx] = useState(0)

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
    setNewForm(EMPTY_NOTE_FORM)
    setAddError(null)
    setEditingId(null)
    setDeletingId(null)
    setCarouselIdx(0)
    loadNotes(profile.profile_id)
  }

  // ── Add note ──────────────────────────────────────────────────────────────
  const handleAddNote = async () => {
    if (!newForm.note_text.trim()) {
      setAddError('Note text cannot be empty.')
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const created = await createNote({
        profile_id:      selectedProfile.profile_id,
        note_text:       newForm.note_text.trim(),
        note_category:   newForm.note_category,
        kpi_target:      newForm.kpi_target.trim()      || null,
        kpi_achievement: newForm.kpi_achievement.trim() || null,
        kpi_rating:      newForm.kpi_rating             || null,
        // employee_response intentionally excluded — only the employee can set it
      })
      setNotes((prev) => [created, ...prev])
      setNewForm(EMPTY_NOTE_FORM)
    } catch {
      setAddError('Failed to add note. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  // ── Edit note ─────────────────────────────────────────────────────────────
  const startEdit = (note) => {
    setEditingId(note.note_id)
    setEditForm({
      note_text:         note.note_text         || '',
      note_category:     note.note_category     || 'GENERAL',
      kpi_target:        note.kpi_target        || '',
      kpi_achievement:   note.kpi_achievement   || '',
      kpi_rating:        note.kpi_rating        || null,
      employee_response: note.employee_response || '',
    })
    setEditError(null)
    setDeletingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm(EMPTY_NOTE_FORM)
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!editForm.note_text.trim()) {
      setEditError('Note text cannot be empty.')
      return
    }
    setSaving(true)
    setEditError(null)
    try {
      const updated = await updateNote(editingId, {
        note_text:       editForm.note_text.trim(),
        note_category:   editForm.note_category,
        kpi_target:      editForm.kpi_target.trim()      || null,
        kpi_achievement: editForm.kpi_achievement.trim() || null,
        kpi_rating:      editForm.kpi_rating             || null,
        // employee_response is intentionally excluded — only the employee can set it
      })
      setNotes((prev) =>
        prev.map((n) => (n.note_id === editingId ? { ...n, ...updated, note_text: updated?.note_text ?? editForm.note_text.trim() } : n))
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
                <p className="mb-4 text-sm font-semibold text-slate-700">
                  Add Note for {selectedProfile.name}
                </p>

                {/* Category selector */}
                <div className="mb-3">
                  <label className="mb-1.5 block text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {KPI_CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => setNF('note_category')(cat.value)}
                        className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                        style={
                          newForm.note_category === cat.value
                            ? { backgroundColor: cat.color, color: '#fff', borderColor: cat.color }
                            : { borderColor: '#e2e8f0', color: '#64748b' }
                        }
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main note text */}
                <textarea
                  value={newForm.note_text}
                  onChange={(e) => { setNFEvt('note_text')(e); setAddError(null) }}
                  rows={3}
                  placeholder={
                    newForm.note_category === 'EMPLOYEE_FEEDBACK'
                      ? 'Record the employee\'s feedback or comment…'
                      : newForm.note_category === 'GENERAL'
                      ? 'Enter a performance observation or note…'
                      : 'Describe the performance observation for this KPI…'
                  }
                  className={TEXTAREA_CLS}
                />

                {/* KPI fields — shown for non-GENERAL, non-EMPLOYEE_FEEDBACK */}
                {!['GENERAL', 'EMPLOYEE_FEEDBACK'].includes(newForm.note_category) && (
                  <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4 ring-1 ring-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">KPI Details</p>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">KPI Target / Expected Standard</label>
                      <textarea
                        value={newForm.kpi_target}
                        onChange={setNFEvt('kpi_target')}
                        rows={2}
                        placeholder="What was the agreed target or standard?"
                        className={TEXTAREA_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Achievement Against Target</label>
                      <textarea
                        value={newForm.kpi_achievement}
                        onChange={setNFEvt('kpi_achievement')}
                        rows={2}
                        placeholder="What was actually achieved?"
                        className={TEXTAREA_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-600">Rating (1 = Poor, 5 = Excellent)</label>
                      <KpiRatingInput
                        value={newForm.kpi_rating}
                        onChange={setNF('kpi_rating')}
                      />
                    </div>
                  </div>
                )}

                {/* Employee response is set by the employee via their own feedback page — not available here */}

                {addError && (
                  <p className="mt-2 text-xs text-red-600">{addError}</p>
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
              ) : (() => {
                // ── Category carousel ──────────────────────────────────────
                const activeCat   = KPI_CATEGORIES[carouselIdx]
                const catNotes    = notes.filter((n) => (n.note_category || 'GENERAL') === activeCat.value)
                const totalCats   = KPI_CATEGORIES.length
                return (
                  <div>
                    {/* Carousel header */}
                    <div className="mb-3 flex items-center justify-between rounded-xl px-4 py-3 ring-1 ring-slate-200"
                      style={{ backgroundColor: activeCat.color + '12' }}>
                      <button
                        onClick={() => { setCarouselIdx((i) => (i - 1 + totalCats) % totalCats); setEditingId(null); setDeletingId(null) }}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4 text-slate-500" />
                      </button>

                      <div className="text-center">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
                          style={{ backgroundColor: activeCat.color, color: '#fff' }}
                        >
                          <Tag className="h-3.5 w-3.5" />
                          {activeCat.label}
                        </span>
                        <p className="mt-1 text-xs text-slate-400">
                          {catNotes.length} note{catNotes.length !== 1 ? 's' : ''}
                        </p>
                      </div>

                      <button
                        onClick={() => { setCarouselIdx((i) => (i + 1) % totalCats); setEditingId(null); setDeletingId(null) }}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      </button>
                    </div>

                    {/* Dot indicators */}
                    <div className="mb-3 flex items-center justify-center gap-1.5">
                      {KPI_CATEGORIES.map((cat, i) => (
                        <button
                          key={cat.value}
                          onClick={() => { setCarouselIdx(i); setEditingId(null); setDeletingId(null) }}
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: i === carouselIdx ? '20px' : '8px',
                            backgroundColor: i === carouselIdx ? activeCat.color : '#cbd5e1',
                          }}
                          title={cat.label}
                        />
                      ))}
                    </div>

                    {/* Notes for active category */}
                    {catNotes.length === 0 ? (
                      <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
                        <StickyNote className="mx-auto mb-2 h-5 w-5 text-slate-300" />
                        <p className="text-sm text-slate-400">No {activeCat.label.toLowerCase()} notes yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {catNotes.map((note) => (
                    <div
                      key={note.note_id}
                      className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 p-5"
                    >
                      {editingId === note.note_id ? (
                        // Edit mode
                        <div className="space-y-3">
                          {/* Category selector */}
                          <div className="flex flex-wrap gap-2">
                            {KPI_CATEGORIES.map((cat) => (
                              <button
                                key={cat.value}
                                type="button"
                                onClick={() => setEF('note_category')(cat.value)}
                                className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
                                style={
                                  editForm.note_category === cat.value
                                    ? { backgroundColor: cat.color, color: '#fff', borderColor: cat.color }
                                    : { borderColor: '#e2e8f0', color: '#64748b' }
                                }
                              >
                                {cat.label}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={editForm.note_text}
                            onChange={(e) => { setEFEvt('note_text')(e); setEditError(null) }}
                            rows={3}
                            className={TEXTAREA_CLS}
                          />
                          {!['GENERAL', 'EMPLOYEE_FEEDBACK'].includes(editForm.note_category) && (
                            <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">KPI Target</label>
                                <textarea value={editForm.kpi_target} onChange={setEFEvt('kpi_target')} rows={2} className={TEXTAREA_CLS} />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">Achievement</label>
                                <textarea value={editForm.kpi_achievement} onChange={setEFEvt('kpi_achievement')} rows={2} className={TEXTAREA_CLS} />
                              </div>
                              <div>
                                <label className="mb-1.5 block text-xs font-medium text-slate-600">Rating</label>
                                <KpiRatingInput value={editForm.kpi_rating} onChange={setEF('kpi_rating')} />
                              </div>
                            </div>
                          )}
                          {/* Employee response is set by the employee only — not editable by HR/Manager */}
                          {editForm.employee_response && (
                            <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-100">
                              <p className="text-xs font-semibold text-amber-700 mb-1">Employee Response (read-only)</p>
                              <p className="text-xs text-amber-800 whitespace-pre-wrap">{editForm.employee_response}</p>
                            </div>
                          )}
                          {editError && (
                            <p className="text-xs text-red-600">{editError}</p>
                          )}
                          <div className="flex items-center gap-2 justify-end">
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
                          {/* Category badge — shown for all categories */}
                          {note.note_category && (
                            <div className="mb-2">
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                                style={{
                                  backgroundColor: getCategoryMeta(note.note_category).color + '1a',
                                  color: getCategoryMeta(note.note_category).color,
                                }}
                              >
                                <Tag className="h-3 w-3" />
                                {getCategoryMeta(note.note_category).label}
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {note.note_text}
                          </p>
                          {/* KPI details */}
                          {(note.kpi_target || note.kpi_achievement || note.kpi_rating) && (
                            <div className="mt-3 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-100 space-y-2 text-xs">
                              {note.kpi_target && (
                                <p><span className="font-semibold text-slate-600">Target:</span> <span className="text-slate-700">{note.kpi_target}</span></p>
                              )}
                              {note.kpi_achievement && (
                                <p><span className="font-semibold text-slate-600">Achievement:</span> <span className="text-slate-700">{note.kpi_achievement}</span></p>
                              )}
                              {note.kpi_rating && (
                                <p>
                                  <span className="font-semibold text-slate-600">Rating: </span>
                                  {[1,2,3,4,5].map((n) => (
                                    <span key={n} className={`inline-block w-5 h-5 rounded text-center leading-5 text-xs font-bold mr-0.5 ${n <= note.kpi_rating ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-400'}`}>{n}</span>
                                  ))}
                                </p>
                              )}
                            </div>
                          )}
                          {/* Employee response */}
                          {note.employee_response && (
                            <div className="mt-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-100">
                              <p className="text-xs font-semibold text-amber-700 mb-1">Employee Response</p>
                              <p className="text-xs text-amber-800 whitespace-pre-wrap">{note.employee_response}</p>
                            </div>
                          )}
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              {note.recorder
                                ? `${note.recorder.first_name} ${note.recorder.last_name}`
                                : 'Unknown'}{' '}
                              · {fmtDate(note.created_at)}
                            </span>

                            {/* Only show actions if not an employee feedback note AND caller is HR or the note's author */}
                            {note.note_category !== 'EMPLOYEE_FEEDBACK' &&
                              (user?.role === 'HR_ADMIN' || note.recorder?.user_id === user?.user_id) && (
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
                )
              })()}

            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
