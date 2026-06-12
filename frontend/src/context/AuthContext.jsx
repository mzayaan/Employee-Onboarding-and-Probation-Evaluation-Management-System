// =============================================================================
// src/context/AuthContext.jsx
// Global authentication context — stores user info and JWT token.
// Provides login(), logout(), and loading state to the whole application.
// FR-01, FR-02 — role-based access begins here.
// =============================================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '@/api/axiosInstance'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Initialise from localStorage so a page refresh does not log the user out
  const [user,    setUser]    = useState(() => {
    try {
      const stored = localStorage.getItem('user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  const [token,   setToken]   = useState(() => localStorage.getItem('token') || null)
  const [loading, setLoading] = useState(true)  // true while verifying stored token

  // ── On mount: verify stored token is still valid ───────────────────────
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const { data } = await api.get('/auth/me')
        if (data.success) {
          setUser(data.user)
          localStorage.setItem('user', JSON.stringify(data.user))
        } else {
          clearAuth()
        }
      } catch {
        clearAuth()
      } finally {
        setLoading(false)
      }
    }
    verifyToken()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────
  const clearAuth = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }, [])

  // ── login: calls POST /api/auth/login, stores result ──────────────────
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    if (data.success) {
      const { token: newToken, user: newUser } = data
      setToken(newToken)
      setUser(newUser)
      localStorage.setItem('token', newToken)
      localStorage.setItem('user', JSON.stringify(newUser))
      return newUser
    }
    throw new Error(data.message || 'Login failed')
  }, [])

  // ── logout: calls POST /api/auth/logout, clears local state ───────────
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Proceed even if the request fails
    } finally {
      clearAuth()
    }
  }, [clearAuth])

  const value = { user, token, loading, login, logout, isAuthenticated: !!user }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Custom hook for consuming the context
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export default AuthContext
