// =============================================================================
// src/pages/hr/employees/EmployeeDetailPage.jsx
// HR views a single employee profile. Matches Figma 12:26.
// Back nav + Generate PDF + Edit Profile + ProfileHdr + Personal Information.
// FR-04, FR-12, FR-16 | NFR-03 | Objective 1
// =============================================================================

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getEmployee, updateEmployeeProfile, getDepartments, getManagers } from '@/api/employeeApi'
import { addAttendanceRecord, getAttendanceByPeriod } from '@/api/attendanceApi'
import { getProbationByProfile } from '@/api/evaluationApi'
import { downloadReport } from '@/api/reportApi'
import { ArrowLeft, Loader2, Save, AlertCircle, FileDown, Edit2, X, ClipboardList, PlusCircle, BarChart3, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { getContractByProfile, createContract } from '@/api/contractApi'
import { getLeaveBalanceByProfile } from '@/api/leaveBalanceApi'
import {
  CalendarHeatmap,
  ExceptionsTable,
  STATUS_OPTIONS,
  STATUS_GROUPS,
} from '@/components/attendance/AttendanceHeatmap'

// ── Attendance section sub-component (FR-12) ──────────────────────────────────
// Props:
//   periodId  — FK to probation_periods (required)
//   startDate — YYYY-MM-DD period start for heatmap range (optional)
//   endDate   — YYYY-MM-DD period end for heatmap range (optional)
function AttendanceSection({ periodId, startDate, endDate }) {
  const [records,    setRecords]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr,    setFormErr]    = useState('')
  const [form, setForm] = useState({ record_date: '', status: 'PRESENT', notes: '' })

  useEffect(() => {
    if (!periodId) { setLoading(false); return }
    getAttendanceByPeriod(periodId)
      .then((data) => setRecords(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [periodId])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.record_date) { setFormErr('Date is required.'); return }
    setSubmitting(true); setFormErr('')
    try {
      await addAttendanceRecord({ period_id: periodId, ...form })
      const updated = await getAttendanceByPeriod(periodId)
      setRecords(Array.isArray(updated) ? updated : [])
      setForm({ record_date: '', status: 'PRESENT', notes: '' })
      setShowForm(false)
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Failed to save record.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!periodId) return null

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" style={{ color: '#1e3a5f' }} />
          <h2 className="text-base font-semibold" style={{ color: '#0f1c2e' }}>Attendance Records</h2>
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{records.length}</span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          {showForm ? 'Cancel' : 'Add Record'}
        </button>
      </div>

      {/* Inline add-record form (collapsed by default) */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          {formErr && <p className="text-xs text-red-600">{formErr}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="emp-att-date" className="mb-1 block text-xs font-medium text-slate-600">Date *</label>
              <input
                id="emp-att-date"
                type="date"
                value={form.record_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, record_date: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="emp-att-status" className="mb-1 block text-xs font-medium text-slate-600">Status *</label>
              <select
                id="emp-att-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {STATUS_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {STATUS_OPTIONS.filter((o) => o.group === group).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="emp-att-notes" className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
            <input
              id="emp-att-notes"
              type="text"
              placeholder="Reason for absence, late arrival, etc."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {submitting ? 'Saving…' : 'Save Record'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormErr('') }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Loading / heatmap + exceptions */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading attendance records…
        </div>
      ) : (
        <>
          <CalendarHeatmap
            records={records}
            startIso={startDate ? startDate.slice(0, 10) : null}
            endIso={endDate   ? endDate.slice(0, 10)   : null}
            compact
          />
          <ExceptionsTable records={records} compact />
        </>
      )}
    </div>
  )
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value || <span className="text-slate-300">—</span>}</p>
    </div>
  )
}

// ── YPN badge (for self-assessment two-way fields) ───────────────────────────
const YPN_COLOUR = {
  Yes:       { bg: '#dcfce7', text: '#166534' },
  Partially: { bg: '#fef9c3', text: '#854d0e' },
  No:        { bg: '#fee2e2', text: '#991b1b' },
}
function YpnBadge({ value }) {
  if (!value) return <span className="text-slate-400">—</span>
  const c = YPN_COLOUR[value] || { bg: '#f1f5f9', text: '#475569' }
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}>
      {value}
    </span>
  )
}

// ── Expanded self-assessment detail panel ─────────────────────────────────────
function SelfAssessmentDetail({ sa }) {
  const ypnRows = [
    { label: 'Understands responsibilities', field: 'understands_responsibilities' },
    { label: 'Received sufficient training', field: 'received_sufficient_training' },
    { label: 'Has required system access',   field: 'has_required_system_access'   },
  ]
  const textRows = [
    { label: 'Onboarding progress',          field: 'onboarding_progress_notes'    },
    { label: 'Self-reflection notes',        field: 'self_reflection_notes'        },
    { label: 'Areas needing support',        field: 'areas_needing_support'        },
    { label: 'Training / support requested', field: 'training_support_requested'   },
    { label: 'Employee comments',            field: 'employee_comments'            },
  ]
  return (
    <div className="bg-slate-50 px-4 py-3 text-sm space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {ypnRows.map(({ label, field }) => (
          <div key={field}>
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            <YpnBadge value={sa[field]} />
          </div>
        ))}
      </div>
      {textRows.map(({ label, field }) =>
        sa[field] ? (
          <div key={field}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{sa[field]}</p>
          </div>
        ) : null
      )}
      {sa.employee_acknowledgement_date && (
        <p className="text-xs text-slate-400">
          Acknowledged: {new Date(sa.employee_acknowledgement_date).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
        </p>
      )}
    </div>
  )
}

// ── Probation Checkpoints Section (FR-13, FR-14, FR-16) ──────────────────────
// Shows HR both the manager score and employee self-assessment score per checkpoint.
function ProbationCheckpointsSection({ profileId }) {
  const [period,       setPeriod]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [expandedSelf, setExpandedSelf] = useState(null)   // checkpoint_id

  useEffect(() => {
    if (!profileId) { setLoading(false); return }
    getProbationByProfile(profileId)
      .then(setPeriod)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profileId])

  if (loading) return (
    <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading evaluation checkpoints…
    </div>
  )

  if (!period || !period.checkpoints?.length) return null

  const scoreColour = (v) =>
    v == null ? '#94a3b8'
    : v >= 75  ? '#15803d'
    : v >= 50  ? '#854d0e'
    : '#b91c1c'

  const scoreBg = (v) =>
    v == null ? '#f1f5f9'
    : v >= 75  ? '#dcfce7'
    : v >= 50  ? '#fef9c3'
    : '#fee2e2'

  return (
    <div className="mt-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-slate-400" />
        <h2 className="font-semibold text-slate-800">Probation Evaluation Checkpoints</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Checkpoint</th>
              <th className="pb-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="pb-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Manager Score</th>
              <th className="pb-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">Self-Assessment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {period.checkpoints.map((cp) => {
              const mgr  = cp.managerEvaluation?.weighted_score != null
                ? Number.parseFloat(cp.managerEvaluation.weighted_score) : null
              const self = cp.selfAssessment?.self_score != null
                ? Number.parseFloat(cp.selfAssessment.self_score) : null
              const hasSaDetail = !!cp.selfAssessment
              const isExpanded  = expandedSelf === cp.checkpoint_id

              return (
                <>
                  <tr key={cp.checkpoint_id}>
                    <td className="py-3 text-xs font-medium text-slate-700">{cp.checkpoint_label}</td>
                    <td className="py-3">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor: cp.status === 'COMPLETED' ? '#dcfce7' : cp.status === 'OVERDUE' ? '#fee2e2' : '#f1f5f9',
                          color:            cp.status === 'COMPLETED' ? '#15803d' : cp.status === 'OVERDUE' ? '#b91c1c' : '#64748b',
                        }}
                      >
                        {cp.status}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      {mgr != null ? (
                        <span
                          className="inline-block rounded-full px-3 py-0.5 text-xs font-bold"
                          style={{ backgroundColor: scoreBg(mgr), color: scoreColour(mgr) }}
                        >
                          {mgr.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Not submitted</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {self != null ? (
                        <button
                          onClick={() => setExpandedSelf(isExpanded ? null : cp.checkpoint_id)}
                          className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-bold transition-opacity hover:opacity-80"
                          style={{ backgroundColor: scoreBg(self), color: scoreColour(self) }}
                          title={isExpanded ? 'Hide details' : 'View self-assessment details'}
                        >
                          {self.toFixed(1)}
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Not submitted</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasSaDetail && (
                    <tr key={`${cp.checkpoint_id}-detail`}>
                      <td colSpan={4} className="pb-3">
                        <SelfAssessmentDetail sa={cp.selfAssessment} />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span><span className="font-semibold text-green-700">≥ 75</span> — Confirm Employment</span>
        <span><span className="font-semibold text-yellow-700">50–74</span> — Extend Probation</span>
        <span><span className="font-semibold text-red-700">&lt; 50</span> — Recommend Dismissal</span>
      </div>
    </div>
  )
}

// ── Contract section sub-component (FR-04 extended | WRA 2019 s.13) ──────────
function ContractSection({ profileId }) {
  const [contract,    setContract]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [formErr,     setFormErr]     = useState('')
  const [formSuccess, setFormSuccess] = useState(false)
  const [form, setForm] = useState({
    contract_type:             'PROBATIONARY',
    basic_salary_mur:          '',
    start_date:                '',
    end_date:                  '',
    probation_clause_included: true,
    probation_duration_months: 3,
    notice_period_days:        14,
    contract_reference:        '',
  })

  const setField = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: val }))
  }

  useEffect(() => {
    if (!profileId) { setLoading(false); return }
    getContractByProfile(profileId)
      .then(setContract)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [profileId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormErr('')
    setSubmitting(true)
    try {
      await createContract({
        profile_id:                profileId,
        contract_type:             form.contract_type,
        basic_salary_mur:          Number(form.basic_salary_mur),
        start_date:                form.start_date || undefined,
        end_date:                  form.end_date   || undefined,
        probation_clause_included: form.probation_clause_included,
        probation_duration_months: Number(form.probation_duration_months),
        notice_period_days:        Number(form.notice_period_days),
        contract_reference:        form.contract_reference || undefined,
      })
      const updated = await getContractByProfile(profileId)
      setContract(updated)
      setShowForm(false)
      setFormSuccess(true)
      setTimeout(() => setFormSuccess(false), 3500)
    } catch (err) {
      setFormErr(err?.response?.data?.message || 'Failed to create contract.')
    } finally {
      setSubmitting(false)
    }
  }

  const CONTRACT_LABELS = { PROBATIONARY: 'Probationary', FIXED_TERM: 'Fixed Term', PERMANENT: 'Permanent' }

  return (
    <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold" style={{ color: '#0f1c2e' }}>Employment Contract</h2>
        </div>
        {!contract && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Issue Contract
          </button>
        )}
      </div>

      {formSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
          Contract issued successfully.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading contract…
        </div>
      ) : contract ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Contract Type</p>
            <p className="font-medium text-slate-800">{CONTRACT_LABELS[contract.contract_type] ?? contract.contract_type}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Basic Salary (MUR)</p>
            <p className="font-medium text-slate-800">{Number(contract.basic_salary_mur).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Reference</p>
            <p className="font-medium text-slate-800">{contract.contract_reference || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Probation Clause</p>
            <p className="font-medium text-slate-800">{contract.probation_clause_included ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Probation Duration</p>
            <p className="font-medium text-slate-800">{contract.probation_duration_months} months</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Notice Period</p>
            <p className="font-medium text-slate-800">{contract.notice_period_days} days</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Employee Signature</p>
            <p className="font-medium text-slate-800">
              {contract.signed_at
                ? new Date(contract.signed_at).toLocaleDateString('en-GB')
                : <span className="italic text-slate-400">Awaiting employee signature</span>}
            </p>
          </div>
        </div>
      ) : !showForm ? (
        <p className="text-sm italic text-slate-400">No contract issued yet.</p>
      ) : null}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">New Contract Details</h3>

          {formErr && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {formErr}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contract-type" className="mb-1 block text-xs font-medium text-slate-600">Contract Type *</label>
              <select
                id="contract-type"
                value={form.contract_type}
                onChange={setField('contract_type')}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="PROBATIONARY">Probationary</option>
                <option value="FIXED_TERM">Fixed Term</option>
                <option value="PERMANENT">Permanent</option>
              </select>
            </div>
            <div>
              <label htmlFor="contract-salary" className="mb-1 block text-xs font-medium text-slate-600">Basic Salary (MUR) *</label>
              <input
                id="contract-salary"
                type="number"
                min="0"
                step="1"
                value={form.basic_salary_mur}
                onChange={setField('basic_salary_mur')}
                required
                placeholder="e.g. 25000"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="contract-start-date" className="mb-1 block text-xs font-medium text-slate-600">Contract Start Date</label>
              <input
                id="contract-start-date"
                type="date"
                value={form.start_date}
                onChange={setField('start_date')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="contract-end-date" className="mb-1 block text-xs font-medium text-slate-600">Probation End Date</label>
              <input
                id="contract-end-date"
                type="date"
                value={form.end_date}
                onChange={setField('end_date')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-0.5 text-xs text-slate-400">WRA 2019 s.13: max 184 days from start date.</p>
            </div>
            <div>
              <label htmlFor="contract-probation-months" className="mb-1 block text-xs font-medium text-slate-600">Probation Duration (months)</label>
              <input
                id="contract-probation-months"
                type="number"
                min="1"
                max="12"
                value={form.probation_duration_months}
                onChange={setField('probation_duration_months')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="contract-notice-days" className="mb-1 block text-xs font-medium text-slate-600">Notice Period (days)</label>
              <input
                id="contract-notice-days"
                type="number"
                min="1"
                value={form.notice_period_days}
                onChange={setField('notice_period_days')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label htmlFor="contract-reference" className="mb-1 block text-xs font-medium text-slate-600">Contract Reference</label>
              <input
                id="contract-reference"
                type="text"
                value={form.contract_reference}
                onChange={setField('contract_reference')}
                placeholder="e.g. EMP-2026-001"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex items-center gap-3 pt-5">
              <input
                id="contract-probation-clause"
                type="checkbox"
                checked={form.probation_clause_included}
                onChange={setField('probation_clause_included')}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="contract-probation-clause" className="text-xs font-medium text-slate-600">
                Include Probation Clause (WRA 2019)
              </label>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {submitting ? 'Issuing…' : 'Issue Contract'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormErr('') }}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function probationProgress(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const start   = new Date(startDate).getTime()
  const end     = new Date(endDate).getTime()
  const now     = Date.now()
  const total   = end - start
  if (total <= 0) return 100
  const elapsed = Math.min(now - start, total)
  return Math.round((elapsed / total) * 100)
}

const ONBOARDING_BADGE = {
  IN_PROGRESS: { label: 'Onboarding In Progress', bg: '#fef3c7', color: '#b45309' },
  COMPLETED:   { label: 'Onboarding Completed',   bg: '#dcfce7', color: '#15803d' },
}

// ── Leave balance section (FR-04 extended | WRA 2019 s.45–47) ────────────────
// Shows the employee's annual, sick and vacation leave entitlements and usage
// for the current calendar year. Available to HR Admin and Line Manager.
function LeaveBalanceSection({ profileId }) {
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)

  useEffect(() => {
    if (!profileId) { setLoading(false); return }
    getLeaveBalanceByProfile(profileId)
      .then((data) => { setBalance(data); setLoading(false) })
      .catch(() => { setErr('Failed to load leave balance.'); setLoading(false) })
  }, [profileId])

  const LeaveRow = ({ label, entitled, used, accumulated }) => {
    const remaining = Math.max(0, (entitled ?? 0) - (used ?? 0) + (accumulated ?? 0))
    const pct = entitled > 0 ? Math.min(100, ((used ?? 0) / entitled) * 100) : 0
    return (
      <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-600">{label}</span>
          <span className="text-xs text-slate-400">{(used ?? 0).toFixed(1)} / {(entitled ?? 0).toFixed(1)} days used</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-400' : pct >= 60 ? 'bg-amber-400' : 'bg-green-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {accumulated > 0 && <span className="mr-1 text-blue-600">+{accumulated.toFixed(1)} accumulated</span>}
            {remaining.toFixed(1)} days remaining
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
        Leave Balance — WRA 2019
      </h2>
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading leave balance…
        </div>
      ) : err ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {err}
        </div>
      ) : !balance ? (
        <p className="text-sm text-slate-400">No leave balance record found for this employee.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 mb-1">Year: {balance.year}</p>
          <LeaveRow
            label="Annual Leave (s.45)"
            entitled={balance.annual_leave_entitled}
            used={balance.annual_leave_used}
            accumulated={0}
          />
          <LeaveRow
            label="Sick Leave (s.46)"
            entitled={balance.sick_leave_entitled}
            used={balance.sick_leave_used}
            accumulated={balance.sick_leave_accumulated ?? 0}
          />
          {balance.vacation_leave_eligible ? (
            <LeaveRow
              label="Vacation Leave (s.47)"
              entitled={balance.vacation_leave_entitled}
              used={balance.vacation_leave_used}
              accumulated={0}
            />
          ) : (
            <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-400 ring-1 ring-slate-100">
              Vacation Leave (s.47) — not eligible (salary above MUR 50,000/month threshold)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EmployeeDetailPage() {
  const { id }           = useParams()
  const navigate         = useNavigate()
  const { user: authUser } = useAuth()
  const isManager        = authUser?.role === 'LINE_MANAGER'

  const [employee,    setEmployee]    = useState(null)
  const [departments, setDepartments] = useState([])
  const [managers,    setManagers]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [editing,     setEditing]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [saveSuccess,  setSaveSuccess]  = useState(false)
  const [downloading,  setDownloading]  = useState(false)
  const [reportError,  setReportError]  = useState('')

  const [form, setForm] = useState({
    // Employment & Role
    job_title: '', department_id: '', manager_id: '', phone: '',
    start_date: '', probation_end_date: '', onboarding_status: '',
    employment_type: '', work_schedule_type: '', weekly_working_hours: '',
    work_location: '', salary_scale_tier: '', next_line_of_promotion: '',
    // Personal & Identity
    nic_number: '', tax_account_number: '', date_of_birth: '', nationality: '',
    id_document_type: '', passport_number: '', work_permit_details: '', work_authorisation_expiry: '',
    // Address
    address_line_1: '', address_line_2: '', locality: '', district: '', country: '', postal_code: '',
    // Banking
    bank_name: '', bank_account_number: '',
    // Emergency Contact
    emergency_contact_name: '', emergency_contact_relationship: '', emergency_contact_phone: '',
    // Education & Previous Employment
    highest_qualification: '', field_of_study: '', educational_institution: '',
    previous_job_title: '', previous_company_name: '', employment_history_summary: '',
  })

  useEffect(() => {
    // Managers only need the employee record — skip HR-only lookups (departments/managers)
    // to avoid 403 errors that would abort the whole fetch.
    const fetches = isManager
      ? [getEmployee(id)]
      : [getEmployee(id), getDepartments(), getManagers()]

    Promise.all(fetches)
      .then(([emp, depts = [], mgrs = []]) => {
        setEmployee(emp)
        setDepartments(depts)
        setManagers(mgrs)
        setForm({
          // Employment & Role
          job_title:              emp.job_title              ?? '',
          department_id:          emp.department_id          ?? '',
          manager_id:             emp.manager_id             ?? '',
          phone:                  emp.phone                  ?? '',
          start_date:             emp.start_date             ? emp.start_date.slice(0, 10) : '',
          probation_end_date:     emp.probation_end_date     ? emp.probation_end_date.slice(0, 10) : '',
          onboarding_status:      emp.onboarding_status      ?? 'IN_PROGRESS',
          employment_type:        emp.employment_type        ?? '',
          work_schedule_type:     emp.work_schedule_type     ?? '',
          weekly_working_hours:   emp.weekly_working_hours   != null ? String(emp.weekly_working_hours) : '',
          work_location:          emp.work_location          ?? '',
          salary_scale_tier:      emp.salary_scale_tier      ?? '',
          next_line_of_promotion: emp.next_line_of_promotion ?? '',
          // Personal & Identity
          nic_number:                emp.nic_number                ?? '',
          tax_account_number:        emp.tax_account_number        ?? '',
          date_of_birth:             emp.date_of_birth             ? emp.date_of_birth.slice(0, 10) : '',
          nationality:               emp.nationality               ?? '',
          id_document_type:          emp.id_document_type          ?? '',
          passport_number:           emp.passport_number           ?? '',
          work_permit_details:       emp.work_permit_details       ?? '',
          work_authorisation_expiry: emp.work_authorisation_expiry ? emp.work_authorisation_expiry.slice(0, 10) : '',
          // Address
          address_line_1: emp.address_line_1 ?? '',
          address_line_2: emp.address_line_2 ?? '',
          locality:       emp.locality       ?? '',
          district:       emp.district       ?? '',
          country:        emp.country        ?? '',
          postal_code:    emp.postal_code    ?? '',
          // Banking
          bank_name:           emp.bank_name           ?? '',
          bank_account_number: emp.bank_account_number ?? '',
          // Emergency Contact
          emergency_contact_name:         emp.emergency_contact_name         ?? '',
          emergency_contact_relationship: emp.emergency_contact_relationship ?? '',
          emergency_contact_phone:        emp.emergency_contact_phone        ?? '',
          // Education & Previous Employment
          highest_qualification:     emp.highest_qualification     ?? '',
          field_of_study:            emp.field_of_study            ?? '',
          educational_institution:   emp.educational_institution   ?? '',
          previous_job_title:        emp.previous_job_title        ?? '',
          previous_company_name:     emp.previous_company_name     ?? '',
          employment_history_summary: emp.employment_history_summary ?? '',
        })
      })
      .catch(() => setError('Failed to load employee details.'))
      .finally(() => setLoading(false))
  }, [id, isManager])

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveError(''); setSaveSuccess(false); setSaving(true)
    try {
      const payload = {
        ...form,
        department_id:        form.department_id        ? Number(form.department_id)        : null,
        manager_id:           form.manager_id           ? Number(form.manager_id)           : null,
        weekly_working_hours: form.weekly_working_hours ? Number(form.weekly_working_hours) : null,
        // Blank strings become null for optional fields
        date_of_birth:             form.date_of_birth             || null,
        work_authorisation_expiry: form.work_authorisation_expiry || null,
      }
      await updateEmployeeProfile(id, payload)
      setSaveSuccess(true)
      setEditing(false)
      // Refresh employee data
      const updated = await getEmployee(id)
      setEmployee(updated)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  // FR-16: Download PDF evaluation report for the active probation period
  const handleDownloadReport = async () => {
    setReportError('')
    // Find the active (or most recent) probation period
    const periods = employee?.probationPeriods || []
    const activePeriod = periods.find((p) => p.status === 'ACTIVE') || periods[periods.length - 1]
    if (!activePeriod) {
      setReportError('No probation period found for this employee.')
      return
    }
    setDownloading(true)
    try {
      const blob = await downloadReport(activePeriod.period_id)
      // Create a temporary anchor element to trigger the browser download
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = `probation-report-${employee.user?.first_name}-${employee.user?.last_name}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate PDF report. Ensure at least one checkpoint has been completed.'
      setReportError(msg)
    } finally {
      setDownloading(false)
    }
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

  if (error || !employee) {
    return (
      <AppShell>
        <div className="flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error || 'Employee not found.'}
        </div>
      </AppShell>
    )
  }

  const u         = employee.user ?? {}
  const probPct   = probationProgress(employee.start_date, employee.probation_end_date)
  const onbBadge  = ONBOARDING_BADGE[employee.onboarding_status] ?? ONBOARDING_BADGE.IN_PROGRESS

  return (
    <AppShell>
      {/* Top bar: Back + Actions */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(isManager ? '/manager/team' : '/hr/employees')}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {isManager ? 'Back to My Team' : 'Back to Employees'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadReport}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {downloading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              : <><FileDown className="h-4 w-4" /> Generate PDF Report</>}
          </button>
          {/* Edit Profile — HR Admin only; managers have read-only access */}
          {!isManager && (
            <button
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
              {editing ? 'Cancel Edit' : 'Edit Profile'}
            </button>
          )}
        </div>
      </div>

      {/* Profile Header card */}
      <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {u.first_name?.[0]}{u.last_name?.[0]}
          </div>

          {/* Name + tags */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold" style={{ color: '#0f1c2e' }}>
              {u.first_name} {u.last_name}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{u.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {employee.job_title && (
                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-medium text-slate-600">
                  {employee.job_title}
                </span>
              )}
              <span
                className="rounded-full px-3 py-0.5 text-xs font-medium"
                style={{ backgroundColor: onbBadge.bg, color: onbBadge.color }}
              >
                {onbBadge.label}
              </span>
              {!u.is_active && (
                <span className="rounded-full bg-slate-200 px-3 py-0.5 text-xs font-medium text-slate-500">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Probation progress bar */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Probation progress</p>
            <p className="text-xs font-medium text-slate-700">{probPct}%</p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${probPct}%`, backgroundColor: probPct >= 100 ? '#16a34a' : '#1e3a5f' }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>{formatDate(employee.start_date)}</span>
            <span>{formatDate(employee.probation_end_date)}</span>
          </div>
        </div>
      </div>

      {/* Save success toast */}
      {saveSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
          Profile updated successfully.
        </div>
      )}

      {/* PDF report error banner (FR-16) */}
      {reportError && (
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{reportError}</span>
        </div>
      )}

      {/* Read-only view (both roles) or edit form (HR Admin only) */}
      {(!editing || isManager) ? (
        <>
          {/* Employment & Role */}
          <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Employment &amp; Role</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <InfoField label="Work Email"      value={u.email} />
              <InfoField label="Phone"           value={employee.phone} />
              <InfoField label="Job Title"       value={employee.job_title} />
              <InfoField label="Department"      value={employee.department?.name} />
              <InfoField
                label="Manager"
                value={employee.manager ? `${employee.manager.first_name} ${employee.manager.last_name}` : null}
              />
              <InfoField label="Role"            value={u.role?.replace(/_/g, ' ')} />
              <InfoField label="Start Date"      value={formatDate(employee.start_date)} />
              <InfoField label="Probation Ends"  value={formatDate(employee.probation_end_date)} />
              <InfoField label="Employment Type" value={employee.employment_type?.replace(/_/g, ' ')} />
              <InfoField label="Work Schedule"   value={employee.work_schedule_type?.replace(/_/g, ' ')} />
              <InfoField label="Weekly Hours"    value={employee.weekly_working_hours != null ? `${employee.weekly_working_hours} hrs` : null} />
              <InfoField label="Work Location"   value={employee.work_location} />
              <InfoField label="Salary Scale"    value={employee.salary_scale_tier} />
              <InfoField label="Next Promotion"  value={employee.next_line_of_promotion} />
              <InfoField label="Evaluation Status" value={employee.evaluation_status?.replace(/_/g, ' ')} />
              <InfoField label="Account Status"  value={u.is_active ? 'Active' : 'Inactive'} />
              <InfoField label="Last Login"      value={formatDate(u.last_login_at)} />
              <InfoField label="Member Since"    value={formatDate(u.created_at)} />
            </div>
          </div>

          {/* Identity & Compliance */}
          <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Identity &amp; Compliance</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <InfoField label="NIC Number"           value={employee.nic_number} />
              <InfoField label="Tax Account (TAN)"    value={employee.tax_account_number} />
              <InfoField label="Date of Birth"        value={employee.date_of_birth ? formatDate(employee.date_of_birth) : null} />
              <InfoField label="Nationality"          value={employee.nationality} />
              <InfoField label="ID Document Type"     value={employee.id_document_type?.replace(/_/g, ' ')} />
              <InfoField label="Passport Number"      value={employee.passport_number} />
              <InfoField label="Work Permit Details"  value={employee.work_permit_details} />
              <InfoField label="Work Auth. Expiry"    value={employee.work_authorisation_expiry ? formatDate(employee.work_authorisation_expiry) : null} />
              <InfoField label="Personal Email"       value={employee.personal_email} />
            </div>
          </div>

          {/* Address */}
          <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Address</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <InfoField label="Address Line 1" value={employee.address_line_1} />
              <InfoField label="Address Line 2" value={employee.address_line_2} />
              <InfoField label="Locality"       value={employee.locality} />
              <InfoField label="District"       value={employee.district} />
              <InfoField label="Country"        value={employee.country} />
              <InfoField label="Postal Code"    value={employee.postal_code} />
            </div>
          </div>

          {/* Banking Details */}
          <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Banking Details</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <InfoField label="Bank Name"           value={employee.bank_name} />
              <InfoField label="Bank Account Number" value={employee.bank_account_number} />
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Emergency Contact</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <InfoField label="Contact Name"     value={employee.emergency_contact_name} />
              <InfoField label="Relationship"     value={employee.emergency_contact_relationship} />
              <InfoField label="Contact Phone"    value={employee.emergency_contact_phone} />
            </div>
          </div>

          {/* Education & Previous Employment */}
          <div className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Education &amp; Previous Employment</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
              <InfoField label="Highest Qualification"   value={employee.highest_qualification} />
              <InfoField label="Field of Study"          value={employee.field_of_study} />
              <InfoField label="Institution"             value={employee.educational_institution} />
              <InfoField label="Previous Job Title"      value={employee.previous_job_title} />
              <InfoField label="Previous Company"        value={employee.previous_company_name} />
              <InfoField label="Previous Salary (MUR)"   value={employee.previous_salary_monthly != null ? Number(employee.previous_salary_monthly).toLocaleString() : null} />
            </div>
            {employee.employment_history_summary && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Employment History Summary</p>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{employee.employment_history_summary}</p>
              </div>
            )}
          </div>

          {/* Attendance records — HR Admin and Line Manager (FR-12) */}
          {/* FRONT-ISSUE-1 fix: use ACTIVE period first, fall back to most recent —
              same logic as handleDownloadReport. Using periods[0] (oldest) was wrong
              for employees whose probation has been extended (multiple periods). */}
          {(() => {
            const periods = employee?.probationPeriods ?? []
            const p = periods.find((x) => x.status === 'ACTIVE') ?? periods[periods.length - 1]
            return (
              <AttendanceSection
                periodId={p?.period_id ?? null}
                startDate={p?.start_date ?? null}
                endDate={p?.end_date ?? null}
              />
            )
          })()}

          {/* Probation checkpoint scores — HR Admin (FR-13, FR-14, FR-16) */}
          <ProbationCheckpointsSection profileId={employee.profile_id} />

          {/* Employment contract — HR Admin only (FR-04 extended | WRA 2019 s.13) */}
          {!isManager && (
            <ContractSection profileId={employee.profile_id} />
          )}

          {/* Leave balance — HR Admin + Line Manager (FR-04 extended | WRA 2019 s.45–47) */}
          <LeaveBalanceSection profileId={employee.profile_id} />
        </>
      ) : (
        /* Edit form — HR Admin only */
        <form onSubmit={handleSave} className="rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-5 text-base font-semibold" style={{ color: '#0f1c2e' }}>Edit Profile</h2>

          {saveError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {saveError}
            </div>
          )}

          {/* ── Section: Employment & Role ───────────────────────────────── */}
          <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">Employment &amp; Role</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <div>
              <label htmlFor="edit-job-title" className="mb-1 block text-xs font-medium text-slate-600">Job Title *</label>
              <input id="edit-job-title" type="text" value={form.job_title} onChange={set('job_title')} required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-phone" className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
              <input id="edit-phone" type="tel" value={form.phone} onChange={set('phone')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-department" className="mb-1 block text-xs font-medium text-slate-600">Department</label>
              <select id="edit-department" value={form.department_id} onChange={set('department_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— None —</option>
                {departments.map((d) => (<option key={d.department_id} value={d.department_id}>{d.name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-manager" className="mb-1 block text-xs font-medium text-slate-600">Manager</label>
              <select id="edit-manager" value={form.manager_id} onChange={set('manager_id')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— None —</option>
                {managers.map((m) => (<option key={m.user_id} value={m.user_id}>{m.first_name} {m.last_name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-start-date" className="mb-1 block text-xs font-medium text-slate-600">Start Date *</label>
              <input id="edit-start-date" type="date" value={form.start_date} onChange={set('start_date')} required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-probation-end" className="mb-1 block text-xs font-medium text-slate-600">Probation End Date *</label>
              <input id="edit-probation-end" type="date" value={form.probation_end_date} onChange={set('probation_end_date')} required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-onboarding-status" className="mb-1 block text-xs font-medium text-slate-600">Onboarding Status</label>
              <select id="edit-onboarding-status" value={form.onboarding_status} onChange={set('onboarding_status')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-employment-type" className="mb-1 block text-xs font-medium text-slate-600">Employment Type</label>
              <select id="edit-employment-type" value={form.employment_type} onChange={set('employment_type')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— None —</option>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-work-schedule" className="mb-1 block text-xs font-medium text-slate-600">Work Schedule</label>
              <select id="edit-work-schedule" value={form.work_schedule_type} onChange={set('work_schedule_type')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— None —</option>
                <option value="STANDARD">Standard</option>
                <option value="SHIFT">Shift</option>
                <option value="FLEXIBLE">Flexible</option>
                <option value="REMOTE">Remote</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-weekly-hours" className="mb-1 block text-xs font-medium text-slate-600">Weekly Working Hours</label>
              <input id="edit-weekly-hours" type="number" min="1" max="80" value={form.weekly_working_hours} onChange={set('weekly_working_hours')}
                placeholder="e.g. 40"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-work-location" className="mb-1 block text-xs font-medium text-slate-600">Work Location</label>
              <input id="edit-work-location" type="text" value={form.work_location} onChange={set('work_location')}
                placeholder="e.g. Head Office, Port Louis"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-salary-tier" className="mb-1 block text-xs font-medium text-slate-600">Salary Scale Tier</label>
              <input id="edit-salary-tier" type="text" value={form.salary_scale_tier} onChange={set('salary_scale_tier')}
                placeholder="e.g. Grade 3"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-next-promotion" className="mb-1 block text-xs font-medium text-slate-600">Next Line of Promotion</label>
              <input id="edit-next-promotion" type="text" value={form.next_line_of_promotion} onChange={set('next_line_of_promotion')}
                placeholder="e.g. Senior Developer"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {/* ── Section: Personal & Identity ─────────────────────────────── */}
          <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide border-t border-slate-100 pt-5">Personal &amp; Identity</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <div>
              <label htmlFor="edit-nic" className="mb-1 block text-xs font-medium text-slate-600">NIC Number</label>
              <input id="edit-nic" type="text" value={form.nic_number} onChange={set('nic_number')}
                placeholder="e.g. T150498001234"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-tan" className="mb-1 block text-xs font-medium text-slate-600">Tax Account Number (TAN)</label>
              <input id="edit-tan" type="text" value={form.tax_account_number} onChange={set('tax_account_number')}
                placeholder="e.g. MU20000001"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-dob" className="mb-1 block text-xs font-medium text-slate-600">Date of Birth</label>
              <input id="edit-dob" type="date" value={form.date_of_birth} onChange={set('date_of_birth')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-nationality" className="mb-1 block text-xs font-medium text-slate-600">Nationality</label>
              <input id="edit-nationality" type="text" value={form.nationality} onChange={set('nationality')}
                placeholder="e.g. Mauritian"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-id-type" className="mb-1 block text-xs font-medium text-slate-600">ID Document Type</label>
              <select id="edit-id-type" value={form.id_document_type} onChange={set('id_document_type')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— None —</option>
                <option value="NIC">NIC</option>
                <option value="PASSPORT">Passport</option>
                <option value="RESIDENCE_PERMIT">Residence Permit</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-passport" className="mb-1 block text-xs font-medium text-slate-600">Passport Number</label>
              <input id="edit-passport" type="text" value={form.passport_number} onChange={set('passport_number')}
                placeholder="If applicable"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-work-permit" className="mb-1 block text-xs font-medium text-slate-600">Work Permit Details</label>
              <input id="edit-work-permit" type="text" value={form.work_permit_details} onChange={set('work_permit_details')}
                placeholder="Permit reference if applicable"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-work-auth-expiry" className="mb-1 block text-xs font-medium text-slate-600">Work Auth. Expiry</label>
              <input id="edit-work-auth-expiry" type="date" value={form.work_authorisation_expiry} onChange={set('work_authorisation_expiry')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {/* ── Section: Address ─────────────────────────────────────────── */}
          <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide border-t border-slate-100 pt-5">Address</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <div>
              <label htmlFor="edit-addr1" className="mb-1 block text-xs font-medium text-slate-600">Address Line 1</label>
              <input id="edit-addr1" type="text" value={form.address_line_1} onChange={set('address_line_1')}
                placeholder="House / Apartment number, Street name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-addr2" className="mb-1 block text-xs font-medium text-slate-600">Address Line 2</label>
              <input id="edit-addr2" type="text" value={form.address_line_2} onChange={set('address_line_2')}
                placeholder="Village / Building (optional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-locality" className="mb-1 block text-xs font-medium text-slate-600">Locality</label>
              <input id="edit-locality" type="text" value={form.locality} onChange={set('locality')}
                placeholder="e.g. Quatre Bornes"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-district" className="mb-1 block text-xs font-medium text-slate-600">District</label>
              <input id="edit-district" type="text" value={form.district} onChange={set('district')}
                placeholder="e.g. Plaines Wilhems"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-country" className="mb-1 block text-xs font-medium text-slate-600">Country</label>
              <input id="edit-country" type="text" value={form.country} onChange={set('country')}
                placeholder="e.g. Mauritius"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-postal-code" className="mb-1 block text-xs font-medium text-slate-600">Postal Code</label>
              <input id="edit-postal-code" type="text" value={form.postal_code} onChange={set('postal_code')}
                placeholder="e.g. 72201"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {/* ── Section: Banking ─────────────────────────────────────────── */}
          <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide border-t border-slate-100 pt-5">Banking Details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <div>
              <label htmlFor="edit-bank-name" className="mb-1 block text-xs font-medium text-slate-600">Bank Name</label>
              <select id="edit-bank-name" value={form.bank_name} onChange={set('bank_name')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                <option value="">— None —</option>
                {['MCB','SBM','ABSA','MAUBANK','AfrAsia','BCP','HSBC'].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-bank-acc" className="mb-1 block text-xs font-medium text-slate-600">Bank Account Number</label>
              <input id="edit-bank-acc" type="text" value={form.bank_account_number} onChange={set('bank_account_number')}
                placeholder="Account number"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {/* ── Section: Emergency Contact ───────────────────────────────── */}
          <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide border-t border-slate-100 pt-5">Emergency Contact</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <div>
              <label htmlFor="edit-ec-name" className="mb-1 block text-xs font-medium text-slate-600">Contact Name</label>
              <input id="edit-ec-name" type="text" value={form.emergency_contact_name} onChange={set('emergency_contact_name')}
                placeholder="e.g. Jane Doe"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-ec-rel" className="mb-1 block text-xs font-medium text-slate-600">Relationship</label>
              <input id="edit-ec-rel" type="text" value={form.emergency_contact_relationship} onChange={set('emergency_contact_relationship')}
                placeholder="e.g. Spouse, Parent"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-ec-phone" className="mb-1 block text-xs font-medium text-slate-600">Contact Phone</label>
              <input id="edit-ec-phone" type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')}
                placeholder="+230 5900 0000"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
          </div>

          {/* ── Section: Education & Previous Employment ─────────────────── */}
          <h3 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide border-t border-slate-100 pt-5">Education &amp; Previous Employment</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
            <div>
              <label htmlFor="edit-qualification" className="mb-1 block text-xs font-medium text-slate-600">Highest Qualification</label>
              <input id="edit-qualification" type="text" value={form.highest_qualification} onChange={set('highest_qualification')}
                placeholder="e.g. BSc Software Engineering"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-field-of-study" className="mb-1 block text-xs font-medium text-slate-600">Field of Study</label>
              <input id="edit-field-of-study" type="text" value={form.field_of_study} onChange={set('field_of_study')}
                placeholder="e.g. Computer Science"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-institution" className="mb-1 block text-xs font-medium text-slate-600">Educational Institution</label>
              <input id="edit-institution" type="text" value={form.educational_institution} onChange={set('educational_institution')}
                placeholder="e.g. University of Technology, Mauritius"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-prev-job" className="mb-1 block text-xs font-medium text-slate-600">Previous Job Title</label>
              <input id="edit-prev-job" type="text" value={form.previous_job_title} onChange={set('previous_job_title')}
                placeholder="e.g. Junior Developer"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
              <label htmlFor="edit-prev-company" className="mb-1 block text-xs font-medium text-slate-600">Previous Company</label>
              <input id="edit-prev-company" type="text" value={form.previous_company_name} onChange={set('previous_company_name')}
                placeholder="e.g. Acme Corp"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="edit-emp-history" className="mb-1 block text-xs font-medium text-slate-600">Employment History Summary</label>
              <textarea id="edit-emp-history" rows={3} value={form.employment_history_summary} onChange={set('employment_history_summary')}
                placeholder="Brief summary of previous employment history"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none" />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setSaveError('') }}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </AppShell>
  )
}
