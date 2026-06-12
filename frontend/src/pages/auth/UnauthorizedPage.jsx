// =============================================================================
// src/pages/auth/UnauthorizedPage.jsx
// Shown when a logged-in user tries to access a route they are not permitted
// to view.  NFR-03 — enforced at the ProtectedRoute level.
// =============================================================================

import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

const ROLE_ROUTES = {
  HR_ADMIN:     '/hr/dashboard',
  LINE_MANAGER: '/manager/dashboard',
  NEW_EMPLOYEE: '/employee/dashboard',
  SYSTEM_ADMIN: '/admin/dashboard',
}

export default function UnauthorizedPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const goBack = () => {
    const route = user ? ROLE_ROUTES[user.role] : '/login'
    navigate(route, { replace: true })
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center space-y-4 max-w-sm px-6">
        <ShieldAlert className="mx-auto h-14 w-14 text-red-500" />
        <h1 className="text-xl font-bold" style={{ color: '#0f1c2e' }}>Access Denied</h1>
        <p className="text-sm text-slate-500">
          You do not have permission to view this page. Please contact your HR Administrator
          if you believe this is an error.
        </p>
        <Button onClick={goBack} className="mt-4" style={{ backgroundColor: '#1e3a5f' }}>
          Return to Dashboard
        </Button>
      </div>
    </div>
  )
}
