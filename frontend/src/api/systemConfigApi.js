// =============================================================================
// src/api/systemConfigApi.js
// API calls for system configuration (minimum salary management).
// SYSTEM_ADMIN access for write operations; all authenticated roles can read
// the current active configuration.
//
// Spec s.1.3, s.2.2 | FR-NEW-02
// =============================================================================

import api from './axiosInstance'

/**
 * Fetch the currently active minimum salary configuration.
 * Returns the row with the highest effective_date on or before today.
 */
export const getCurrentConfig = () =>
  api.get('/system-config/current').then((r) => r.data.data)

/**
 * Fetch all historical minimum salary entries, newest first.
 * SYSTEM_ADMIN only.
 */
export const getConfigHistory = () =>
  api.get('/system-config/history').then((r) => r.data.data)

/**
 * Create a new minimum salary entry (append-only).
 * SYSTEM_ADMIN only.
 *
 * @param {{ min_salary_mur: number, effective_date: string }} payload
 */
export const createConfig = (payload) =>
  api.post('/system-config', payload).then((r) => r.data)
