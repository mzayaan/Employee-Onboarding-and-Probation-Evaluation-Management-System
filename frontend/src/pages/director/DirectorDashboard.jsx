// =============================================================================
// src/pages/director/DirectorDashboard.jsx
//
// Director role dashboard.
// Shows a summary of the pending approval queue and provides quick navigation
// to the pending approvals page.
//
// Route:  /director/dashboard
// FR-15 (Director must approve final recommendations) | Objective 3
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { listPendingDirector, listAllRecommendations } from '@/api/directorApi'
import {
  ShieldCheck, ClipboardList, CheckCircle2, Clock,
  ChevronRight, Loader2, AlertCircle,
} from 'lucide-react'

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, colour, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 text-left transition hover:shadow-md hover:ring-slate-300 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: colour + '20' }}
        >
          <Icon className="h-5 w-5" style={{ color: colour }} />
        </div>
        {onClick && <ChevronRight className="h-4 w-4 text-slate-300" />}
      </div>
      <p className="mt-3 text-3xl font-bold" style={{ color: '#0f1c2e' }}>{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </button>
  )
}

// ── Recent recommendations table ─────────────────────────────────────────────
const REC_LABELS = {
  CONFIRM:  { label: 'Confirm Employment',  bg: 'bg-green-50',  text: 'text-green-700'  },
  EXTEND:   { label: 'Extend Probation',    bg: 'bg-amber-50',  text: 'text-amber-700'  },
  DISMISS:  { label: 'Recommend Dismissal', bg: 'bg-red-50',    text: 'text-red-700'    },
}
const STATUS_LABELS = {
  PENDING_HR_REVIEW:    { label: 'Awaiting HR',       bg: 'bg-blue-50',   text: 'text-blue-700'   },
  RETURNED_TO_MANAGER:  { label: 'Returned',          bg: 'bg-amber-50',  text: 'text-amber-700'  },
  PENDING_DIRECTOR:     { label: 'Awaiting Director', bg: 'bg-purple-50', text: 'text-purple-700' },
  UNDER_REVIEW:         { label: 'Under Review',      bg: 'bg-sky-50',    text: 'text-sky-700'    },
  APPROVED:             { label: 'Approved',          bg: 'bg-green-50',  text: 'text-green-700'  },
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function RecentTable({ recs }) {
  if (!recs.length) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
        <ClipboardList className="mx-auto mb-2 h-7 w-7 text-slate-300" />
        <p className="text-sm text-slate-400">No recommendations in the system yet.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-5 py-3 text-left">Employee</th>
            <th className="px-5 py-3 text-left">Recommendation</th>
            <th className="px-5 py-3 text-left">Score</th>
            <th className="px-5 py-3 text-left">Status</th>
            <th className="px-5 py-3 text-left">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {recs.slice(0, 8).map((r) => {
            const emp = r.probationPeriod?.employeeProfile
            const rec = REC_LABELS[r.recommendation_type] || { label: r.recommendation_type, bg: 'bg-slate-50', text: 'text-slate-600' }
            const st  = STATUS_LABELS[r.approval_status]  || { label: r.approval_status,    bg: 'bg-slate-50', text: 'text-slate-600' }
            return (
              <tr key={r.rec_id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-3 font-medium text-slate-700">
                  {emp?.user?.first_name} {emp?.user?.last_name}
                  <span className="ml-2 text-xs font-normal text-slate-400">{emp?.job_title ?? ''}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${rec.bg} ${rec.text}`}>
                    {rec.label}
                  </span>
                </td>
                <td className="px-5 py-3 font-semibold text-slate-700">
                  {r.cumulative_score != null ? Number.parseFloat(r.cumulative_score).toFixed(1) : '—'}%
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.bg} ${st.text}`}>
                    {st.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{fmtDate(r.generated_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DirectorDashboard() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [pending,  setPending]  = useState([])
  const [allRecs,  setAllRecs]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([listPendingDirector(), listAllRecommendations()])
      .then(([p, a]) => {
        setPending(Array.isArray(p) ? p : [])
        setAllRecs(Array.isArray(a) ? a : [])
      })
      .catch(() => setLoadErr('Failed to load dashboard data.'))
      .finally(() => setLoading(false))
  }, [])

  const approvedCount = allRecs.filter((r) => r.approval_status === 'APPROVED').length
  const totalCount    = allRecs.length

  return (
    <AppShell>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Good {getTimeOfDay()}, {user?.first_name}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Director approval dashboard — Employee Onboarding &amp; Probation System
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : loadErr ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-6 py-4 text-sm text-red-600 ring-1 ring-red-200">
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {loadErr}
        </div>
      ) : (
        <>
          {/* ── Stat cards ────────────────────────────────────────────── */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Clock}
              label="Awaiting Your Approval"
              value={pending.length}
              colour="#7c3aed"
              onClick={pending.length > 0 ? () => navigate('/director/pending') : null}
            />
            <StatCard
              icon={CheckCircle2}
              label="Approved by Director"
              value={approvedCount}
              colour="#16a34a"
            />
            <StatCard
              icon={ClipboardList}
              label="Total Recommendations"
              value={totalCount}
              colour="#1e3a5f"
            />
          </div>

          {/* ── Pending prompt ────────────────────────────────────────── */}
          {pending.length > 0 && (
            <div className="mb-8 flex items-center justify-between rounded-xl bg-purple-50 px-6 py-4 ring-1 ring-purple-200">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-semibold text-purple-900">
                    {pending.length} recommendation{pending.length !== 1 ? 's' : ''} awaiting your decision
                  </p>
                  <p className="text-sm text-purple-600">
                    These have been endorsed by HR and are ready for your final approval.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/director/pending')}
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
              >
                Review Now <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── Recent recommendations ────────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-800">All Recommendations</h2>
            <RecentTable recs={allRecs} />
          </section>
        </>
      )}
    </AppShell>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
