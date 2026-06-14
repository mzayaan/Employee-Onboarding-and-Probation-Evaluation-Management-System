// =============================================================================
// src/pages/auth/ResetPasswordPage.jsx
// Password reset page — reads ?token= from the URL query string,
// lets the user choose a new password and submits to POST /api/auth/reset-password.
// Matches the split-panel design used by LoginPage and ForgotPasswordPage.
// FR-03 | NFR-02
// =============================================================================

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import api from '@/api/axiosInstance'

export default function ResetPasswordPage() {
  const navigate          = useNavigate()
  const [searchParams]    = useSearchParams()
  const token             = searchParams.get('token') ?? ''

  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword,    setShowPassword]    = useState(false)
  const [loading,         setLoading]         = useState(false)
  const [success,         setSuccess]         = useState(false)
  const [error,           setError]           = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Reset token is missing. Please use the link from your email.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password })
      setSuccess(true)
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'This reset link is invalid or has expired. Please request a new one.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────── */}
      <div
        className="hidden md:flex md:w-[41.7%] flex-col justify-between px-12 py-12"
        style={{ backgroundColor: '#0f1c2e' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white flex-shrink-0"
            style={{ backgroundColor: '#3d7dd3' }}
          >
            HR
          </div>
          <span className="text-white font-semibold text-base tracking-tight">HR Onboard</span>
        </div>

        {/* Copy */}
        <div>
          <h1 className="text-3xl font-bold text-white leading-tight">
            Choose a new<br />password
          </h1>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Create a strong password for your HR Onboard account. You will be redirected to the login
            page once your password has been updated.
          </p>
        </div>

        <div />
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm">
          {success ? (
            /* Success state */
            <div className="text-center">
              <div
                className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: '#dcfce7' }}
              >
                <CheckCircle className="h-7 w-7" style={{ color: '#15803d' }} />
              </div>
              <h2 className="text-xl font-bold" style={{ color: '#0f1c2e' }}>Password updated</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                Your password has been reset successfully. You can now log in with your new password.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            /* Form */
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Set New Password</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Enter and confirm your new password below
                </p>
              </div>

              {/* No token in URL */}
              {!token && (
                <div className="mb-4 flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Invalid or missing reset token. Please use the link from your email or{' '}
                    <button
                      onClick={() => navigate('/forgot-password')}
                      className="font-semibold underline"
                    >
                      request a new link
                    </button>
                    .
                  </span>
                </div>
              )}

              {error && (
                <div className="mb-4 flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New password */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: '#0f1c2e' }}
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword
                        ? <EyeOff className="h-4 w-4" />
                        : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: '#0f1c2e' }}
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-4 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Updating…</>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </form>

              <button
                onClick={() => navigate('/login')}
                className="mt-5 w-full text-sm font-medium"
                style={{ color: '#1e3a5f' }}
              >
                Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
