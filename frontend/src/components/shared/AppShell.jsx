// =============================================================================
// src/components/shared/AppShell.jsx
// Main application layout wrapper: Sidebar (left) + top-bar + main content.
// All authenticated pages are rendered inside this shell.
//
// Spec s.4.1 — consolidated profile block (avatar + name + job title) top-right
// FR-09   — top-bar bell icon polls unread notification count
// =============================================================================

import { useState, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import Sidebar                 from './Sidebar'
import { Bell, KeyRound, LogOut } from 'lucide-react'
import { getUnreadCount }         from '@/api/notificationApi'
import { useAuth }                from '@/context/AuthContext'

// ── Avatar colour palette — deterministic from first character of name ──────
// Six distinct slate/indigo/teal tones that look good on a 32-px circle.
const AVATAR_COLOURS = [
  { bg: '#3b82f6', text: '#fff' }, // blue-500
  { bg: '#6366f1', text: '#fff' }, // indigo-500
  { bg: '#0ea5e9', text: '#fff' }, // sky-500
  { bg: '#14b8a6', text: '#fff' }, // teal-500
  { bg: '#8b5cf6', text: '#fff' }, // violet-500
  { bg: '#f59e0b', text: '#fff' }, // amber-500
]

function avatarColour(name = '') {
  const idx = (name.charCodeAt(0) || 0) % AVATAR_COLOURS.length
  return AVATAR_COLOURS[idx]
}

function getInitials(firstName = '', lastName = '') {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?'
}

// ── ProfileAvatar: circular photo or initials fallback ──────────────────────
function ProfileAvatar({ user, employeeProfile, size = 32 }) {
  const imgUrl  = employeeProfile?.profile_image_url
  const initials = getInitials(user?.first_name, user?.last_name)
  const colour  = avatarColour(user?.first_name || '')

  if (imgUrl) {
    return (
      <img
        src={imgUrl}
        alt={initials}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <span
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        justifyContent:  'center',
        width:           size,
        height:          size,
        borderRadius:    '50%',
        backgroundColor: colour.bg,
        color:           colour.text,
        fontWeight:      600,
        fontSize:        size * 0.38,
        flexShrink:      0,
        userSelect:      'none',
      }}
    >
      {initials}
    </span>
  )
}

export default function AppShell({ children }) {
  const navigate                          = useNavigate()
  const { user, employeeProfile, logout } = useAuth()
  const [count, setCount]                 = useState(0)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  // Poll unread count every 60 s — silent on error (non-fatal)
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const n = await getUnreadCount()
        if (active) setCount(n)
      } catch { /* silent */ }
    }
    void poll()
    const id = setInterval(poll, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Derive display label — job title from profile; fall back to role label
  const roleLabels = {
    HR_ADMIN:     'HR Administrator',
    LINE_MANAGER: 'Line Manager',
    NEW_EMPLOYEE: 'New Employee',
    SYSTEM_ADMIN: 'System Administrator',
    DIRECTOR:     'Director',
  }
  const jobLabel =
    employeeProfile?.job_title ||
    roleLabels[user?.role] ||
    user?.role ||
    ''

  const fullName =
    user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : ''

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Fixed-width sidebar */}
      <Sidebar />

      {/* Right panel: top-bar + scrollable content */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-end gap-2 px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">

          {/* Consolidated profile block (Spec s.4.1) */}
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left"
            title="My Profile"
          >
            <ProfileAvatar user={user} employeeProfile={employeeProfile} size={60} />
            <span className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
                {fullName}
              </span>
              {jobLabel && (
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  {jobLabel}
                </span>
              )}
            </span>
          </button>

          {/* Divider */}
          <span className="h-6 w-px bg-slate-200" aria-hidden="true" />

          {/* Change password */}
          <button
            onClick={() => navigate('/settings/change-password')}
            className="flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Change Password"
          >
            <KeyRound className="h-5 w-5" />
          </button>

          {/* Notifications */}
          <button
            onClick={() => navigate('/notifications')}
            className="relative flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {count > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white text-[10px] font-bold"
                style={{ backgroundColor: '#e53e3e' }}
              >
                {count > 9 ? '9+' : count}
              </span>
            )}
          </button>

          {/* Sign Out */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Sign Out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        {/* Scrollable main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="min-h-full px-8 py-8">
            {children}
          </div>
        </main>

      </div>
    </div>
  )
}
