// =============================================================================
// src/pages/auth/ForgotPasswordPage.jsx
// Password recovery page — matches Figma 12:22.
// Split layout: dark navy left panel + white right form panel.
// FR-03 | NFR-02
// =============================================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle, Loader2 } from 'lucide-react'
import api from '@/api/axiosInstance'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()

  const [email,     setEmail]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [sent,      setSent]      = useState(false)
  const [error,     setError]     = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Please enter your email address.'); return }
    setLoading(true); setError('')
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      // Avoid leaking whether email exists — always show success-like message
      setSent(true)
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
            Recover your<br />account access
          </h1>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Enter the email address associated with your account. We'll send you a link to reset your password.
          </p>
        </div>

        {/* Bottom spacer */}
        <div />
      </div>

      {/* ── Right panel ─────────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-white px-6">
        <div className="w-full max-w-sm">
          {sent ? (
            /* Success state */
            <div className="text-center">
              <div
                className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: '#dcfce7' }}
              >
                <CheckCircle className="h-7 w-7" style={{ color: '#15803d' }} />
              </div>
              <h2 className="text-xl font-bold" style={{ color: '#0f1c2e' }}>Check your inbox</h2>
              <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your email and follow the instructions.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="mt-6 flex w-full items-center justify-center gap-2 text-sm font-medium"
                style={{ color: '#1e3a5f' }}
              >
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </button>
            </div>
          ) : (
            /* Form */
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Reset Password</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Enter your email to receive a password reset link
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: '#0f1c2e' }}
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition disabled:opacity-60"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              <button
                onClick={() => navigate('/login')}
                className="mt-5 flex w-full items-center justify-center gap-1.5 text-sm font-medium"
                style={{ color: '#1e3a5f' }}
              >
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
