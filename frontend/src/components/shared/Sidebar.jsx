// =============================================================================
// src/components/shared/Sidebar.jsx
// Role-aware collapsible sidebar navigation.  Renders different nav items
// depending on the authenticated user's role (FR-02, NFR-03).
// =============================================================================

import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  BarChart3,
  CheckSquare,
  Settings,
  LogOut,
  UserCircle,
  ShieldCheck,
  Bell,
} from 'lucide-react'

import { useAuth } from '@/context/AuthContext'
import { cn }      from '@/lib/utils'

// ── Navigation config per role ─────────────────────────────────────────────
const NAV_ITEMS = {
  HR_ADMIN: [
    { to: '/hr/dashboard',   icon: LayoutDashboard, label: 'Dashboard'    },
    { to: '/hr/employees',   icon: Users,            label: 'Employees'   },
    { to: '/hr/documents',   icon: FileText,         label: 'Documents'   },
    { to: '/hr/tasks',       icon: ClipboardList,    label: 'Tasks'       },
    { to: '/hr/evaluations', icon: BarChart3,        label: 'Evaluations' },
    { to: '/hr/reports',     icon: CheckSquare,      label: 'Reports'     },
    { to: '/hr/audit-log',   icon: ShieldCheck,      label: 'Audit Log'   },
  ],
  LINE_MANAGER: [
    { to: '/manager/dashboard',   icon: LayoutDashboard, label: 'Dashboard'    },
    { to: '/manager/team',        icon: Users,            label: 'My Team'      },
    { to: '/manager/evaluations', icon: BarChart3,        label: 'Evaluations'  },
    { to: '/manager/tasks',       icon: ClipboardList,    label: 'Tasks'        },
    { to: '/manager/reports',     icon: FileText,         label: 'Reports'      },
  ],
  NEW_EMPLOYEE: [
    { to: '/employee/dashboard',  icon: LayoutDashboard, label: 'Dashboard'     },
    { to: '/employee/documents',  icon: FileText,         label: 'My Documents'  },
    { to: '/employee/tasks',      icon: ClipboardList,    label: 'My Tasks'      },
    { to: '/employee/evaluation', icon: BarChart3,        label: 'Self-Assessment' },
    { to: '/employee/profile',    icon: UserCircle,       label: 'My Profile'    },
  ],
  SYSTEM_ADMIN: [
    { to: '/admin/dashboard',     icon: LayoutDashboard, label: 'Dashboard'     },
    { to: '/admin/users',         icon: Users,            label: 'User Management' },
    { to: '/admin/criteria',      icon: Settings,         label: 'Criteria Config' },
    { to: '/admin/audit-log',     icon: ShieldCheck,      label: 'Audit Log'     },
    { to: '/admin/notifications', icon: Bell,             label: 'Settings'      },
  ],
}

const ROLE_LABELS = {
  HR_ADMIN:     'HR Administrator',
  LINE_MANAGER: 'Line Manager',
  NEW_EMPLOYEE: 'New Employee',
  SYSTEM_ADMIN: 'System Administrator',
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const items = NAV_ITEMS[user?.role] || []

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside
      className="flex h-full w-64 flex-col"
      style={{ backgroundColor: '#0f1c2e' }}
    >
      {/* ── Logo ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: '#3d7dd3' }}
        >
          HR
        </div>
        <span className="text-white font-semibold text-sm tracking-tight leading-none">
          HR Onboard
        </span>
      </div>

      {/* ── Nav items ─────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )
            }
            style={({ isActive }) =>
              isActive ? { backgroundColor: '#1e3a5f' } : {}
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* ── User info + logout ─────────────────────────────────────────── */}
      <div className="px-3 pb-4 pt-2 border-t border-white/10 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold flex-shrink-0"
            style={{ backgroundColor: '#235080' }}
          >
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-white/50 truncate">
              {ROLE_LABELS[user?.role]}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:text-white hover:bg-white/5"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
