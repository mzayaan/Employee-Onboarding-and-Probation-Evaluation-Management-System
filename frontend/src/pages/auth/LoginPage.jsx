// =============================================================================
// src/pages/auth/LoginPage.jsx
// Login page — matches the Figma "Screen — Login" design (node 12:21).
// Split layout: dark-navy left panel (branding) + light right panel (form).
// FR-01, FR-02 — role-based routing begins after successful login.
// =============================================================================

import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react'

import { useAuth } from '@/context/AuthContext'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { Label }   from '@/components/ui/label'

// Role → dashboard route mapping (FR-02)
const ROLE_ROUTES = {
  HR_ADMIN:     '/hr/dashboard',
  LINE_MANAGER: '/manager/dashboard',
  NEW_EMPLOYEE: '/employee/dashboard',
  SYSTEM_ADMIN: '/admin/dashboard',
}

// Feature bullets displayed on the left panel (matches Figma Features block)
const FEATURES = [
  'Document submission & HR verification',
  'Probation evaluation with weighted scoring',
  'Automated PDF evaluation reports',
  'Real-time HR monitoring dashboard',
]

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, isAuthenticated, user, loading } = useAuth()

  const [showPassword, setShowPassword] = useState(false)
  const [apiError,     setApiError]     = useState('')
  const [submitting,   setSubmitting]   = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ mode: 'onBlur' })

  // Already authenticated → redirect to the correct dashboard
  if (!loading && isAuthenticated && user) {
    return <Navigate to={ROLE_ROUTES[user.role] || '/login'} replace />
  }

  const onSubmit = async ({ email, password }) => {
    setApiError('')
    setSubmitting(true)
    try {
      const loggedInUser = await login(email, password)
      navigate(ROLE_ROUTES[loggedInUser.role] || '/login', { replace: true })
    } catch (err) {
      setApiError(
        err.response?.data?.message || err.message || 'Unable to sign in. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">

      {/* ── Left Panel — branding (navy-900, 600/1440 = 41.7%) ────────── */}
      <div
        className="hidden lg:flex lg:w-[41.7%] flex-col justify-between px-16 py-16"
        style={{ backgroundColor: '#0f1c2e' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white font-bold text-lg"
            style={{ backgroundColor: '#3d7dd3' }}
          >
            HR
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            HR Onboard
          </span>
        </div>

        {/* Tagline */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold leading-snug text-white">
              Streamline Employee Onboarding &amp; Probation Management
            </h1>
            <p className="mt-6 text-sm leading-relaxed" style={{ color: '#88b5e8' }}>
              A centralised, role-based platform for HR teams to manage onboarding
              documents, track probation evaluations and generate automated reports.
            </p>
          </div>

          {/* Feature bullets */}
          <ul className="space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: '#3d7dd3' }}
                />
                <span className="text-sm" style={{ color: '#b3d0f2' }}>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-xs" style={{ color: '#4a6a8a' }}>
          University of Technology, Mauritius — FYP 2025/26
        </p>
      </div>

      {/* ── Right Panel — login form ───────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-sm">

          {/* Form card */}
          <div className="rounded-xl bg-white px-10 py-10 shadow-sm ring-1 ring-slate-200">

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight" style={{ color: '#0f1c2e' }}>
                Welcome back
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                Sign in to your account to continue
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-700">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  disabled={submitting}
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Enter a valid email address',
                    },
                  })}
                  className={errors.email ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
                {errors.email && (
                  <p className="text-xs text-red-600">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-700">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    disabled={submitting}
                    {...register('password', {
                      required: 'Password is required',
                      minLength: { value: 6, message: 'Password must be at least 6 characters' },
                    })}
                    className={errors.password ? 'border-red-500 focus-visible:ring-red-500 pr-10' : 'pr-10'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              {/* Forgot password */}
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-xs font-medium hover:underline"
                  style={{ color: '#3d7dd3' }}
                  tabIndex={-1}
                >
                  Forgot password?
                </button>
              </div>

              {/* API error */}
              {apiError && (
                <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                  {apiError}
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                style={{ backgroundColor: '#1e3a5f' }}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Signing in…
                  </span>
                ) : 'Sign In'}
              </Button>
            </form>

            {/* Roles hint */}
            <div
              className="mt-6 rounded-lg px-4 py-3 text-center text-xs leading-relaxed"
              style={{ backgroundColor: '#f0f6fc', color: '#4a6a8a' }}
            >
              Accessible by: HR Administrator · Line Manager · New Employee · System Administrator
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
