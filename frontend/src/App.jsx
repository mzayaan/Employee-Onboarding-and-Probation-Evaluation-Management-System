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
import LoginPage          from '@/pages/auth/LoginPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import UnauthorizedPage   from '@/pages/auth/UnauthorizedPage'

// Role dashboards
import HRDashboard       from '@/pages/hr/HRDashboard'
import ManagerDashboard  from '@/pages/manager/ManagerDashboard'
import EmployeeDashboard from '@/pages/employee/EmployeeDashboard'
import AdminDashboard    from '@/pages/admin/AdminDashboard'

// Admin — Criteria configuration (Block 7)
import CriteriaConfigPage from '@/pages/admin/CriteriaConfigPage'

// HR — Employee management (Block 4)
import EmployeeListPage   from '@/pages/hr/employees/EmployeeListPage'
import AddEmployeePage    from '@/pages/hr/employees/AddEmployeePage'
import EmployeeDetailPage from '@/pages/hr/employees/EmployeeDetailPage'

// HR — Document review (Block 4)
import DocumentReviewPage from '@/pages/hr/documents/DocumentReviewPage'

// HR — Task management (Block 5)
import TaskManagementPage from '@/pages/hr/tasks/TaskManagementPage'

// Employee — Document management (Block 4)
import UploadDocumentPage from '@/pages/employee/documents/UploadDocumentPage'
import MyDocumentsPage    from '@/pages/employee/documents/MyDocumentsPage'

// Employee — Task management (Block 5)
import MyTasksPage from '@/pages/employee/tasks/MyTasksPage'

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
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/unauthorized"    element={<UnauthorizedPage />} />

          {/* Root → dashboard redirect */}
          <Route path="/" element={<RootRedirect />} />

          {/* ── HR Administrator ───────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['HR_ADMIN']} />}>
            <Route path="/hr/dashboard"            element={<HRDashboard />} />
            <Route path="/hr/employees"            element={<EmployeeListPage />} />
            <Route path="/hr/employees/add"        element={<AddEmployeePage />} />
            <Route path="/hr/employees/:id"        element={<EmployeeDetailPage />} />
            {/* Block 4 — document review */}
            <Route path="/hr/documents"            element={<DocumentReviewPage />} />
            {/* Block 5 — task management */}
            <Route path="/hr/tasks"                element={<TaskManagementPage />} />
          </Route>

          {/* ── Line Manager ───────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['LINE_MANAGER']} />}>
            <Route path="/manager/dashboard" element={<ManagerDashboard />} />
          </Route>

          {/* ── New Employee ───────────────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['NEW_EMPLOYEE']} />}>
            <Route path="/employee/dashboard"          element={<EmployeeDashboard />} />
            {/* Block 4 — document management */}
            <Route path="/employee/documents"          element={<MyDocumentsPage />} />
            <Route path="/employee/documents/upload"   element={<UploadDocumentPage />} />
            {/* Block 5 — task management */}
            <Route path="/employee/tasks"              element={<MyTasksPage />} />
          </Route>

          {/* ── System Administrator ───────────────────────────────── */}
          <Route element={<ProtectedRoute allowedRoles={['SYSTEM_ADMIN']} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/criteria"  element={<CriteriaConfigPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
