// =============================================================================
// src/api/dashboardApi.js
// Dashboard API helpers — wraps Axios calls to /api/dashboard
// FR-08, FR-17 | Objective 1 & 4
// =============================================================================

import api from './axiosInstance'

// HR: summary stat cards
export const getDashboardStats = async () => {
  const res = await api.get('/dashboard/stats')
  return res.data.data
}

// HR: per-employee onboarding progress table
export const getOnboardingProgress = async () => {
  const res = await api.get('/dashboard/onboarding-progress')
  return res.data.data
}

// Employee: own progress summary
export const getMyProgress = async () => {
  const res = await api.get('/dashboard/my-progress')
  return res.data.data
}
