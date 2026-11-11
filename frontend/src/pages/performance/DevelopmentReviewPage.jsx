// =============================================================================
// src/pages/performance/DevelopmentReviewPage.jsx
// HR Admin and Line Manager can create, view, edit and delete development reviews
// (work-life balance, professional balance, actions to balance personal/work life).
// FR-12 | NFR-03 | Objective 2
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getMyTeam } from '@/api/evaluationApi'
import { getEmployees } from '@/api/employeeApi'
import {
  createReview,
  getReviewsByProfile,
  updateReview,
  deleteReview,
} from '@/api/developmentReviewApi'
import {
  Heart,
  Loader2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Calendar,
} from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const BALANCE_OPTIONS = [
  'Well Balanced',
  'Mostly Balanced',
  'Somewhat Unbalanced',
  'Very Unbalanced',
]

const BALANCE_COLOR = {
  'Well Balanced':        { bg: '#dcfce7', text: '#166534' },
  'Mostly Balanced':      { bg: '#dbeafe', text: '#1e40af' },
  'Somewhat Unbalanced':  { bg: '#fef9c3', text: '#854d0e' },
  'Very Unbalanced':      { bg: '#fee2e2', text: '#991b1b' },
}

const TEXTAREA_CLS =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 ' +
  'placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none'

const INPUT_CLS =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 ' +
  'focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300'

const SELECT_CLS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 ' +
  'focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300'

// Returns a date string YYYY-MM-DD offset by `days` from today
const addDays = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Default next review = 30 days from today
const defaultNextReviewDate = () => addDays(30)

const EMPTY_FORM = {
  work_life_balance_rating:       '',
  workload_assessment:            '',
  professional_balance_notes:     '',
  professional_development_goals: '',
  actions_to_balance:             '',
  support_offered:                '',
  next_review_date:               '',
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── Helper: Section label ─────────────────────────────────────────────────────
function FieldLabel({ children, required }) {
  return (
    <label className="block text-xs font-semibold text-slate-600 mb-1">
      {children}
      {required && <span className="ml-1 text-red-500">*</span>}
    </label>
  )
}

// ── Balance badge ─────────────────────────────────────────────────────────────
function BalanceBadge({ rating }) {
  if (!rating) return <span className="text-slate-400 text-xs">Not set</span>
  const { bg, text } = BALANCE_COLOR[rating] || { bg: '#f1f5f9', text: '#475569' }
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {rating}
    </span>
  )
}

// ── Review Form (shared for Add and Edit) ─────────────────────────────────────
function ReviewForm({ form, onChange, onChangeEvt, error, loading, submitLabel, onSubmit, onCancel }) {
  const showKpiFields = true

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit() }}
      className="space-y-4"
    >
      {/* Work-Life Balance Rating */}
      <div>
        <FieldLabel>Work / Personal Life Balance Assessment</FieldLabel>
        <select
          value={form.work_life_balance_rating}
          onChange={onChangeEvt('work_life_balance_rating')}
          className={SELECT_CLS}
        >
          <option value="">— Select balance rating —</option>
          {BALANCE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          Is the employee's work/personal life balance satisfactory?
        </p>
      </div>

      {/* Workload Assessment */}
      <div>
        <FieldLabel>Workload Assessment</FieldLabel>
        <textarea
          rows={3}
          value={form.workload_assessment}
          onChange={onChangeEvt('workload_assessment')}
          placeholder="Describe overall workload — is the employee overloaded, underloaded, or at an appropriate level?"
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Professional Balance */}
      <div>
        <FieldLabel>Professional Balance Notes</FieldLabel>
        <textarea
          rows={3}
          value={form.professional_balance_notes}
          onChange={onChangeEvt('professional_balance_notes')}
          placeholder="Observations on career progression, role clarity, job satisfaction, or professional balance…"
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Professional Development Goals */}
      <div>
        <FieldLabel>Professional Development Goals</FieldLabel>
        <textarea
          rows={3}
          value={form.professional_development_goals}
          onChange={onChangeEvt('professional_development_goals')}
          placeholder="Agreed development goals for the next review period…"
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Actions to Balance */}
      <div>
        <FieldLabel>Actions to Balance Personal Life vs Work</FieldLabel>
        <textarea
          rows={3}
          value={form.actions_to_balance}
          onChange={onChangeEvt('actions_to_balance')}
          placeholder="Actions agreed to improve work-life balance (e.g. flexible working hours, reduced overtime, remote work arrangements)…"
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Support Offered */}
      <div>
        <FieldLabel>Support / Resources Offered</FieldLabel>
        <textarea
          rows={2}
          value={form.support_offered}
          onChange={onChangeEvt('support_offered')}
          placeholder="Support or resources offered to the employee (e.g. EAP, mentoring, additional training)…"
          className={TEXTAREA_CLS}
        />
      </div>

      {/* Next Review Date */}
      <div>
        <FieldLabel>Next Development Review Date</FieldLabel>
        <input
          type="date"
          value={form.next_review_date}
          onChange={onChangeEvt('next_review_date')}
          className={INPUT_CLS}
        />
        <p className="mt-1 text-xs text-slate-400">
          Auto-set to 30 days from today. Adjust if a different interval is required.
        </p>
      </div>

      {error && (
        <p className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DevelopmentReviewPage() {
  const { user } = useAuth()

  // Employee list
  const [employees, setEmployees]   = useState([])
  const [empLoading, setEmpLoading] = useState(true)
  const [empError, setEmpError]     = useState(null)

  // Selected employee
  const [selectedProfile, setSelectedProfile] = useState(null)

  // Reviews list
  const [reviews, setReviews]             = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError]     = useState(null)

  // Expand/collapse
  const [expandedId, setExpandedId] = useState(null)

  // Add form
  const [showAdd, setShowAdd]   = useState(false)
  const [newForm, setNewForm]   = useState(EMPTY_FORM)
  const [addError, setAddError] = useState(null)
  const [adding, setAdding]     = useState(false)
  const setNF    = (field) => (val) => setNewForm((prev) => ({ ...prev, [field]: val }))
  const setNFEvt = (field) => (e)   => setNF(field)(e.target.value)

  // Edit state
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState(EMPTY_FORM)
  const [editError, setEditError] = useState(null)
  const [saving, setSaving]       = useState(false)
  const setEF    = (field) => (val) => setEditForm((prev) => ({ ...prev, [field]: val }))
  const setEFEvt = (field) => (e)   => setEF(field)(e.target.value)

  // Delete
  const [deletingId, setDeletingId] = useState(null)

  // ── Load employees ─────────────────────────────────────────────────────────
  useEffect(() => {
    setEmpLoading(true)
    const fetcher = user?.role === 'LINE_MANAGER' ? getMyTeam() : getEmployees()
    fetcher
      .then((data) => {
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

  // ── Load reviews for selected employee ────────────────────────────────────
  const loadReviews = (profileId) => {
    setReviewsLoading(true)
    setReviewsError(null)
    getReviewsByProfile(profileId)
      .then((data) => setReviews(data || []))
      .catch(() => setReviewsError('Failed to load development reviews.'))
      .finally(() => setReviewsLoading(false))
  }

  const handleSelectEmployee = (profile) => {
    setSelectedProfile(profile)
    setNewForm(EMPTY_FORM)
    setAddError(null)
    setShowAdd(false)
    setEditingId(null)
    setDeletingId(null)
    setExpandedId(null)
    loadReviews(profile.profile_id)
  }

  // ── Add review ────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!selectedProfile) return
    setAdding(true)
    setAddError(null)
    try {
      await createReview({ profile_id: selectedProfile.profile_id, ...newForm })
      setNewForm(EMPTY_FORM)
      setShowAdd(false)
      loadReviews(selectedProfile.profile_id)
    } catch (err) {
      setAddError(err?.response?.data?.message || 'Failed to save review.')
    } finally {
      setAdding(false)
    }
  }

  // ── Edit review ───────────────────────────────────────────────────────────
  const startEdit = (review) => {
    setEditingId(review.review_id)
    setEditForm({
      work_life_balance_rating:       review.work_life_balance_rating || '',
      workload_assessment:            review.workload_assessment || '',
      professional_balance_notes:     review.professional_balance_notes || '',
      professional_development_goals: review.professional_development_goals || '',
      actions_to_balance:             review.actions_to_balance || '',
      support_offered:                review.support_offered || '',
      next_review_date:               review.next_review_date || '',
    })
    setEditError(null)
    setExpandedId(review.review_id)
  }

  const handleEdit = async () => {
    if (!editingId) return
    setSaving(true)
    setEditError(null)
    try {
      await updateReview(editingId, editForm)
      setEditingId(null)
      loadReviews(selectedProfile.profile_id)
    } catch (err) {
      setEditError(err?.response?.data?.message || 'Failed to update review.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete review ─────────────────────────────────────────────────────────
  const handleDelete = async (reviewId) => {
    try {
      await deleteReview(reviewId)
      setDeletingId(null)
      loadReviews(selectedProfile.profile_id)
    } catch {
      // keep modal open — no silent fail
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="flex h-full gap-4 p-4">

        {/* ── Left Panel: Employee Selector ── */}
        <aside className="w-72 flex-shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-rose-500" />
            <h2 className="text-sm font-semibold text-slate-700">Employees</h2>
          </div>

          {empLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}

          {empError && (
            <div className="p-4 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" /> {empError}
            </div>
          )}

          {!empLoading && !empError && employees.length === 0 && (
            <p className="p-4 text-sm text-slate-400">No employees found.</p>
          )}

          <ul className="divide-y divide-slate-100">
            {employees.map((emp) => (
              <li key={emp.profile_id}>
                <button
                  onClick={() => handleSelectEmployee(emp)}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-blue-50 ${
                    selectedProfile?.profile_id === emp.profile_id
                      ? 'bg-blue-50 border-l-4 border-blue-600'
                      : ''
                  }`}
                >
                  <p className="text-sm font-medium text-slate-800 truncate">{emp.name || 'Unnamed'}</p>
                  <p className="text-xs text-slate-500 truncate">{emp.jobTitle}</p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Right Panel ── */}
        <main className="flex-1 min-w-0 overflow-y-auto space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Development Reviews</h1>
              <p className="text-xs text-slate-500">
                Work-life balance assessment, professional development and wellbeing review.
              </p>
            </div>
            {selectedProfile && !showAdd && (
              <button
                onClick={() => { setShowAdd(true); setEditingId(null); setNewForm({ ...EMPTY_FORM, next_review_date: defaultNextReviewDate() }) }}
                className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              >
                <Plus className="h-4 w-4" /> New Review
              </button>
            )}
          </div>

          {/* No employee selected */}
          {!selectedProfile && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-20 text-center">
              <Heart className="h-8 w-8 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Select an employee to view or add development reviews.</p>
            </div>
          )}

          {/* Add Form */}
          {selectedProfile && showAdd && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-blue-800 mb-4">
                New Development Review — {selectedProfile.name}
              </h3>
              <ReviewForm
                form={newForm}
                onChange={setNF}
                onChangeEvt={setNFEvt}
                error={addError}
                loading={adding}
                submitLabel="Save Review"
                onSubmit={handleAdd}
                onCancel={() => { setShowAdd(false); setAddError(null) }}
              />
            </div>
          )}

          {/* Reviews list */}
          {selectedProfile && (
            <>
              {reviewsLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              )}

              {reviewsError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" /> {reviewsError}
                </div>
              )}

              {!reviewsLoading && !reviewsError && reviews.length === 0 && !showAdd && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
                  <Heart className="h-6 w-6 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">
                    No development reviews yet for <span className="font-medium">{selectedProfile.name}</span>.
                  </p>
                  <button
                    onClick={() => { setShowAdd(true); setNewForm({ ...EMPTY_FORM, next_review_date: defaultNextReviewDate() }) }}
                    className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="h-4 w-4" /> Add the first review
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {reviews.map((review) => {
                  const isExpanded = expandedId === review.review_id
                  const isEditing  = editingId === review.review_id
                  const isDeleting = deletingId === review.review_id

                  const reviewerName = review.reviewer
                    ? `${review.reviewer.first_name} ${review.reviewer.last_name}`
                    : 'Unknown Reviewer'

                  return (
                    <div
                      key={review.review_id}
                      className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
                    >
                      {/* Card header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <div className="flex items-center gap-3 min-w-0">
                          <BalanceBadge rating={review.work_life_balance_rating} />
                          <div className="min-w-0">
                            <p className="text-xs text-slate-500">
                              Reviewed by <span className="font-medium text-slate-700">{reviewerName}</span>
                              {' · '}
                              {fmtDate(review.created_at)}
                            </p>
                            {review.next_review_date && (
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <Calendar className="h-3 w-3" />
                                Next review: {fmtDate(review.next_review_date)}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setEditingId(null); setExpandedId(isExpanded ? null : review.review_id) }}
                            className="rounded p-1 text-slate-400 hover:text-slate-600"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => startEdit(review)}
                            className="rounded p-1 text-slate-400 hover:text-blue-600"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingId(review.review_id)}
                            className="rounded p-1 text-slate-400 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Delete confirm */}
                      {isDeleting && (
                        <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center justify-between gap-3">
                          <p className="text-sm text-red-700">Delete this development review? This cannot be undone.</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDeletingId(null)}
                              className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDelete(review.review_id)}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Edit form */}
                      {isEditing && isExpanded && (
                        <div className="px-4 py-4 bg-slate-50 border-b border-slate-100">
                          <ReviewForm
                            form={editForm}
                            onChange={setEF}
                            onChangeEvt={setEFEvt}
                            error={editError}
                            loading={saving}
                            submitLabel="Update Review"
                            onSubmit={handleEdit}
                            onCancel={() => { setEditingId(null); setEditError(null) }}
                          />
                        </div>
                      )}

                      {/* Expanded view (read-only) */}
                      {isExpanded && !isEditing && (
                        <div className="px-4 py-4 space-y-4 text-sm text-slate-700">

                          {review.workload_assessment && (
                            <Section label="Workload Assessment">
                              {review.workload_assessment}
                            </Section>
                          )}

                          {review.professional_balance_notes && (
                            <Section label="Professional Balance">
                              {review.professional_balance_notes}
                            </Section>
                          )}

                          {review.professional_development_goals && (
                            <Section label="Professional Development Goals">
                              {review.professional_development_goals}
                            </Section>
                          )}

                          {review.actions_to_balance && (
                            <Section label="Actions to Balance Personal Life vs Work">
                              {review.actions_to_balance}
                            </Section>
                          )}

                          {review.support_offered && (
                            <Section label="Support / Resources Offered">
                              {review.support_offered}
                            </Section>
                          )}

                          {review.employee_acknowledgement && (
                            <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium mt-1">
                              <Check className="h-3.5 w-3.5" />
                              Employee acknowledged
                              {review.employee_acknowledgement_date
                                ? ` on ${fmtDate(review.employee_acknowledgement_date)}`
                                : ''}
                            </div>
                          )}

                          {!review.workload_assessment &&
                            !review.professional_balance_notes &&
                            !review.professional_development_goals &&
                            !review.actions_to_balance &&
                            !review.support_offered && (
                              <p className="text-slate-400 italic text-xs">No additional details recorded.</p>
                            )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>
    </AppShell>
  )
}

// Small read-only section block
function Section({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{children}</p>
    </div>
  )
}
