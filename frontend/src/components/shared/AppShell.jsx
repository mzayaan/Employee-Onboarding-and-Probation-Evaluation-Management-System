// =============================================================================
// src/components/shared/AppShell.jsx
// Main application layout wrapper: Sidebar (left) + top-bar + main content.
// All authenticated pages are rendered inside this shell.
// FR-09 — top-bar bell icon polls unread notification count
// =============================================================================

import { useState, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import Sidebar                 from './Sidebar'
import { Bell }                from 'lucide-react'
import { getUnreadCount }      from '@/api/notificationApi'

export default function AppShell({ children }) {
  const navigate       = useNavigate()
  const [count, setCount] = useState(0)

  // Poll unread count every 60 s — silent on error (non-fatal)
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const n = await getUnreadCount()
        if (active) setCount(n)
      } catch { /* silent */ }
    }
    poll()
    const id = setInterval(poll, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Fixed-width sidebar */}
      <Sidebar />

      {/* Right panel: top-bar + scrollable content */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Top bar */}
        <header className="flex items-center justify-end px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
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
