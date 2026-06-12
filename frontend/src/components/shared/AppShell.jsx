// =============================================================================
// src/components/shared/AppShell.jsx
// Main application layout wrapper: Sidebar (left) + main content area (right).
// All authenticated pages are rendered inside this shell.
// =============================================================================

import Sidebar from './Sidebar'

export default function AppShell({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Fixed-width sidebar */}
      <Sidebar />

      {/* Scrollable main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
