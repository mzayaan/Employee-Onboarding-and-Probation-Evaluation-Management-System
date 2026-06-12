// =============================================================================
// src/pages/hr/HRDashboard.jsx
// HR Administrator dashboard — Objective 4, FR-17.
// Currently a placeholder shell; will receive live stats in Block 8.
// =============================================================================

import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { Users, FileText, ClipboardList, BarChart3 } from 'lucide-react'

const STAT_CARDS = [
  { label: 'Total Employees',    value: '—', icon: Users,        color: '#1e3a5f' },
  { label: 'Pending Documents',  value: '—', icon: FileText,     color: '#f59e0b' },
  { label: 'Active Probations',  value: '—', icon: ClipboardList,color: '#3d7dd3' },
  { label: 'Overdue Evaluations',value: '—', icon: BarChart3,    color: '#dc2626' },
]

export default function HRDashboard() {
  const { user } = useAuth()

  return (
    <AppShell>
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Welcome, {user?.first_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          HR Administrator Dashboard — overview of onboarding and probation activity
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200"
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg flex-shrink-0"
              style={{ backgroundColor: color + '18' }}
            >
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder notice */}
      <div className="mt-8 rounded-xl bg-white px-6 py-8 text-center shadow-sm ring-1 ring-slate-200">
        <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-500">
          Dashboard charts will be populated in Block 8 (Reporting &amp; Analytics)
        </p>
      </div>
    </AppShell>
  )
}
