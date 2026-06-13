// =============================================================================
// src/App.jsx
// Root routing configuration.
// ─ Public routes: /login
// ─ Protected HR routes:       /hr/*       → HR_ADMIN only
// ─ Protected Manager routes:  /manager/*  → LINE_MANAGER only
// ─ Protected Employee routes: /employee/* → NEW_EMPLOYEE only
// ─ Protected Admin routes:    /admin/*    → SYSTEM_ADMIN only
// ─ / → redirects to role-specific dashboard once authenticated
// =============================================================================

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { AuthProvider, useAuth } from '@/context/AuthContext'
import ProtectedRoute             from '@/routes/ProtectedRoute'

// Auth pages
import LoginPage        from '@/pages/auth/LoginPage'
import UnauthorizedPage from '@/pages/auth/UnauthorizedPage'

// Role dashboards
import HRDashboard       from '@/pages/hr/HRDashboard'
import ManagerDashboard  from '@/pages/manager/ManagerDashboard'
import EmployeeDashboard from '@/pages/employee/EmployeeDashboard'
import AdminDashboard    from '@/pages/admin/AdminDashboard'

// HR — Employee management (Block 4)
import EmployeeListPage   from '@/pages/hr/employees/EmployeeListPage'
import AddEmployeePage    from '@/pages/hr/employees/AddEmployeePage'
import EmployeeDetailPage from '@/pages/hr/employees/EmployeeDetailPage'

// HR — Document review (Block 5)
import DocumentReviewPage from '@/pages/hr/documents/DocumentReviewPage'

// Employee — Document management (Block 5)
import UploadDocumentPage from '@/pages/employee/documents/UploadDocumentPage'
import MyDocumentsPage    from '@/pages/employee/documents/MyDocumentsPage'

// Root redirect — sends authenticated users to their dashboard
function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth()

  if (loading) return null

  if (!isAuthenticated) return <Navigate to="/login" replace />

  const routes = {
    HR_ADMIN:     '/hr/dashboard',
    LINE_MANAGER: '/manager/dashboard',
    NEW_EMPLOYEE: '/employee/dashboard',
    SYSTEM_ADMIN: '/admin/dashboard',
  }
  return <Navigate to={routes[user?.role] || '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Root → dashboard redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* ── HR Administrator ───────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['HR_ADMIN']} />}>
            <Route path="/hr/dashboard"            element={<HRDashboard />} />
            <Route path="/hr/employees"            element={<EmployeeListPage />} />
            <Route path="/hr/employees/add"        element={<AddEmployeePage />} />
            <Route path="/hr/employees/:id"        element={<EmployeeDetailPage />} />
            {/* Block 5 — document review */}
            <Route path="/hr/documents"            element={<DocumentReviewPage />} />
          </Route>

          {/* ── Line Manager ───────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['LINE_MANAGER']} />}>
            <Route path="/manager/dashboard" element={<ManagerDashboard />} />
          </Route>

          {/* ── New Employee ───────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['NEW_EMPLOYEE']} />}>
            <Route path="/employee/dashboard"          element={<EmployeeDashboard />} />
            {/* Block 5 — document management */}
            <Route path="/employee/documents"          element={<MyDocumentsPage />} />
            <Route path="/employee/documents/upload"   element={<UploadDocumentPage />} />
          </Route>

          {/* ── System Administrator ───────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['SYSTEM_ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
