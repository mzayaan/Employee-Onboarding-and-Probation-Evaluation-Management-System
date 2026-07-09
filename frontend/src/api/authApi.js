// =============================================================================
// src/api/authApi.js
// Authenticated auth operations — change password.
// FR-03 | NFR-02
// =============================================================================

import api from './axiosInstance'

// GET /api/auth/me
// Returns current user details + employeeProfile for NEW_EMPLOYEE
export const getMe = () =>
  api.get('/auth/me').then((r) => r.data)

// POST /api/auth/change-password
// Body: { currentPassword, newPassword }
export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data)
