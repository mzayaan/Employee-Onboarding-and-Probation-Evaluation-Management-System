// =============================================================================
// src/pages/admin/AdminDashboard.jsx
// System Administrator dashboard — quick overview with links to sub-sections.
// FR-01, FR-10 | NFR-03 | Objective 2
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { getCriteria } from '@/api/criteriaApi'
import {
  Users, Settings, ShieldCheck, Bell,
  ArrowRight, Loader2,
} from 'lucide-react'

export default function AdminDashboard() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [criteria, setCriteria] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    getCriteria()
      .then(setCriteria)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const activeCount = criteria.filter((c) => c.is_active).length
  const totalWeight = criteria
    .filter((c) => c.is_active)
    .reduce((sum, c) => sum + parseFloat(c.weight_percent), 0)
  const weightValid = Math.abs(totalWeight - 100) < 0.01

  const QUICK_LINKS = [
    {
      label:   'Criteria Config',
      subtext: loading
        ? 'Loading…'
        : `${activeCount} active criteria · Total ${totalWeight.toFixed(0)}% ${weightValid ? '✓' : '⚠'}`,
      icon:    Settings,
      color:   '#1e3a5f',
      to:      '/admin/criteria',
    },
    {
      label:   'User Management',
      subtext: 'Manage system users and roles',
      icon:    Users,
      color:   '#3d7dd3',
      to:      '/admin/users',
    },
    {
      label:   'Audit Log',
      subtext: 'Review system activity records',
      icon:    ShieldCheck,
      color:   '#f59e0b',
      to:      '/admin/audit-log',
    },
    {
      label:   'Notifications',
      subtext: 'System notification settings',
      icon:    Bell,
      color:   '#16a34a',
      to:      '/admin/notifications',
    },
  ]

  return (
    <AppShell>
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Welcome, {user?.first_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          System Administrator — manage users, evaluation criteria and system configuration.
        </p>
      </div>

      {/* Quick-action cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {QUICK_LINKS.map(({ label, subtext, icon: Icon, color, to }) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="group flex items-center gap-5 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200 text-left transition-shadow hover:shadow-md"
          >
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: color + '18' }}
            >
              {loading && label === 'Criteria Config'
                ? <Loader2 className="h-5 w-5 animate-spin" style={{ color }} />
                : <Icon className="h-5 w-5" style={{ color }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="mt-0.5 text-xs text-slate-500 truncate">{subtext}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>
    </AppShell>
  )
}
