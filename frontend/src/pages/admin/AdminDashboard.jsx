// =============================================================================
// src/pages/admin/AdminDashboard.jsx
// System Administrator dashboard shell — user management, criteria config
// (FR-01, FR-10).
// =============================================================================

import AppShell from '@/components/shared/AppShell'
import { useAuth } from '@/context/AuthContext'
import { Users, Settings, ShieldCheck, Bell } from 'lucide-react'

const STAT_CARDS = [
  { label: 'Total Users',         value: '—', icon: Users,      color: '#1e3a5f' },
  { label: 'Active Criteria Sets', value: '—', icon: Settings,   color: '#3d7dd3' },
  { label: 'Audit Events Today',  value: '—', icon: ShieldCheck, color: '#f59e0b' },
  { label: 'Pending Notifications',value: '—', icon: Bell,       color: '#dc2626' },
]

export default function AdminDashboard() {
  const { user } = useAuth()

  return (
    <AppShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>
          Welcome, {user?.first_name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          System Administrator — manage users, evaluation criteria and system configuration
        </p>
      </div>

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

      <div className="mt-8 rounded-xl bg-white px-6 py-8 text-center shadow-sm ring-1 ring-slate-200">
        <Settings className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-500">
          User management and evaluation criteria configuration will appear here in Blocks 4 & 7
        </p>
      </div>
    </AppShell>
  )
}
