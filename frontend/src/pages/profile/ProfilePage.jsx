// =============================================================================
// src/pages/profile/ProfilePage.jsx
// View Own Profile — available to all authenticated roles via /profile
// Displays account details from GET /api/auth/me.
// For NEW_EMPLOYEE, also shows employment profile (job title, department, dates).
// FR-02 | NFR-03
// =============================================================================

import { useState, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import { useAuth }             from '@/context/AuthContext'
import AppShell                from '@/components/shared/AppShell'
import { getMe }               from '@/api/authApi'
import { UserCircle, Loader2 } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────
const ROLE_LABELS = {
  HR_ADMIN:     'HR Administrator',
  LINE_MANAGER: 'Line Manager',
  NEW_EMPLOYEE: 'New Employee',
  SYSTEM_ADMIN: 'System Administrator',
}

const DASHBOARD_ROUTES = {
  HR_ADMIN:     '/hr/dashboard',
  LINE_MANAGER: '/manager/dashboard',
  NEW_EMPLOYEE: '/employee/dashboard',
  SYSTEM_ADMIN: '/admin/dashboard',
}

const STATUS_STYLES = {
  IN_PROGRESS: { bg: '#fef9c3', text: '#854d0e', label: 'In Progress' },
  COMPLETED:   { bg: '#dcfce7', text: '#15803d', label: 'Completed'   },
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

// ── Row component ─────────────────────────────────────────────────────────────
function Row({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm font-medium text-slate-500 sm:w-48 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{value || '—'}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const navigate    = useNavigate()
  const { user }    = useAuth()

  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const res = await getMe()
        if (active) setData(res)
      } catch {
        if (active) setError('Could not load profile. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const dashboardPath = DASHBOARD_ROUTES[user?.role] || '/'
  const profile       = data?.employeeProfile
  const statusStyle   = profile ? (STATUS_STYLES[profile.onboarding_status] || STATUS_STYLES.IN_PROGRESS) : null

  return (
    <AppShell>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: '#e8f0fb' }}
        >
          <UserCircle className="h-5 w-5" style={{ color: '#3d7dd3' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Profile</h1>
          <p className="text-sm text-slate-500">Your account and employment details</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      )}

      {error && (
        <div className="max-w-lg rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-5 max-w-lg">

          {/* ── Account Details ──────────────────────────────────────── */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Account Details
              </h2>
            </div>
            <div className="px-5">
              <Row label="Full Name"
                   value={`${data.user.first_name} ${data.user.last_name}`} />
              <Row label="Email Address"  value={data.user.email} />
              <Row label="Role"
                   value={ROLE_LABELS[data.user.role] || data.user.role} />
              <Row label="Member Since"  value={fmt(data.user.created_at)} />
              <Row label="Last Login"    value={data.user.last_login_at
                ? new Date(data.user.last_login_at).toLocaleString('en-GB', {
                    day: '2-digit', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : '—'
              } />
            </div>
          </section>

          {/* ── Employment Details (NEW_EMPLOYEE only) ───────────────── */}
          {profile && (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                  Employment Details
                </h2>
              </div>
              <div className="px-5">
                <Row label="Job Title"       value={profile.job_title} />
                <Row label="Department"      value={profile.department?.name} />
                <Row label="Phone"           value={profile.phone} />
                <Row label="Start Date"      value={fmt(profile.start_date)} />
                <Row label="Probation Ends"  value={fmt(profile.probation_end_date)} />
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-3">
                  <span className="text-sm font-medium text-slate-500 sm:w-48 flex-shrink-0">
                    Onboarding Status
                  </span>
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
                  >
                    {statusStyle.label}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* ── Actions ──────────────────────────────────────────────── */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/settings/change-password')}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Change Password
            </button>
            <button
              onClick={() => navigate(dashboardPath)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              Back to Dashboard
            </button>
          </div>

        </div>
      )}
    </AppShell>
  )
}
