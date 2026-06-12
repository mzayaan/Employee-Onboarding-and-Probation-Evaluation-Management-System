// =============================================================================
// src/routes/ProtectedRoute.jsx
// Guards a route so that only authenticated users with the required role(s)
// can access it.  NFR-03 — employees cannot access other employees' pages.
// =============================================================================

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * @param {string[]} allowedRoles - roles that may access the nested routes.
 *   If omitted, any authenticated user is allowed.
 */
export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth()

  // Show nothing while the token verification is in progress
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-800 border-t-transparent" />
      </div>
    )
  }

  // Not logged in → redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Logged in but wrong role → redirect to /unauthorized
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}
