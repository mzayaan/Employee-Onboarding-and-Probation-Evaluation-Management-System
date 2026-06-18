// =============================================================================
// src/pages/settings/ChangePasswordPage.jsx
// Authenticated users change their own password.
// All four roles — accessible via /settings/change-password
// FR-03 | NFR-02
// =============================================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import AppShell from '@/components/shared/AppShell'
import { changePassword } from '@/api/authApi'
import { KeyRound, Eye, EyeOff, CheckCircle, Loader2 } from 'lucide-react'

// ── Role-specific dashboard paths for the back link ──────────────────────────
const DASHBOARD_ROUTES = {
  HR_ADMIN:     '/hr/dashboard',
  LINE_MANAGER: '/manager/dashboard',
  NEW_EMPLOYEE: '/employee/dashboard',
  SYSTEM_ADMIN: '/admin/dashboard',
}

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
  })

  const [show, setShow] = useState({
    current: false,
    newPw:   false,
    confirm: false,
  })

  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)
  const [error,   setError]     = useState('')
  const [fieldErr, setFieldErr] = useState({})

  const toggle = (field) => setShow((prev) => ({ ...prev, [field]: !prev[field] }))

  const validate = () => {
    const errs = {}
    if (!form.currentPassword)           errs.currentPassword = 'Current password is required.'
    if (!form.newPassword)               errs.newPassword     = 'New password is required.'
    if (form.newPassword.length < 8)     errs.newPassword     = 'Password must be at least 8 characters.'
    if (form.newPassword === form.currentPassword)
      errs.newPassword = 'New password must be different from the current password.'
    if (!form.confirmPassword)           errs.confirmPassword = 'Please confirm your new password.'
    if (form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match.'
    return errs
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    // Clear field-level error on edit
    setFieldErr((prev) => ({ ...prev, [name]: undefined }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setFieldErr(errs); return }

    setLoading(true)
    setError('')
    try {
      await changePassword(form.currentPassword, form.newPassword)
      setSuccess(true)
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to change password. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const dashboardPath = DASHBOARD_ROUTES[user?.role] || '/'

  return (
    <AppShell>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
          style={{ backgroundColor: '#e8f0fb' }}
        >
          <KeyRound className="h-5 w-5" style={{ color: '#3d7dd3' }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Change Password</h1>
          <p className="text-sm text-slate-500">Update your account password</p>
        </div>
      </div>

      {/* Card */}
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

        {success ? (
          /* ── Success state ─────────────────────────────────────── */
          <div className="flex flex-col items-center py-6 text-center">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: '#dcfce7' }}
            >
              <CheckCircle className="h-7 w-7" style={{ color: '#15803d' }} />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Password updated</h2>
            <p className="mt-2 text-sm text-slate-500">
              Your password has been changed successfully.
            </p>
            <button
              onClick={() => navigate(dashboardPath)}
              className="mt-6 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          /* ── Form ───────────────────────────────────────────────── */
          <>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              {/* Current password */}
              <PasswordField
                id="currentPassword"
                name="currentPassword"
                label="Current password"
                value={form.currentPassword}
                show={show.current}
                onToggle={() => toggle('current')}
                onChange={handleChange}
                error={fieldErr.currentPassword}
                autoComplete="current-password"
              />

              {/* New password */}
              <PasswordField
                id="newPassword"
                name="newPassword"
                label="New password"
                value={form.newPassword}
                show={show.newPw}
                onToggle={() => toggle('newPw')}
                onChange={handleChange}
                error={fieldErr.newPassword}
                autoComplete="new-password"
                hint="Minimum 8 characters"
              />

              {/* Confirm new password */}
              <PasswordField
                id="confirmPassword"
                name="confirmPassword"
                label="Confirm new password"
                value={form.confirmPassword}
                show={show.confirm}
                onToggle={() => toggle('confirm')}
                onChange={handleChange}
                error={fieldErr.confirmPassword}
                autoComplete="new-password"
              />

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    'Update Password'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => navigate(dashboardPath)}
                  className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              </div>

            </form>
          </>
        )}
      </div>
    </AppShell>
  )
}

// ── Reusable password input ───────────────────────────────────────────────────
function PasswordField({ id, name, label, value, show, onToggle, onChange, error, autoComplete, hint }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className={`w-full rounded-lg border py-2.5 pl-3 pr-10 text-sm text-slate-800 placeholder-slate-400 outline-none transition
            ${error
              ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
              : 'border-slate-200 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
            }`}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error  && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
