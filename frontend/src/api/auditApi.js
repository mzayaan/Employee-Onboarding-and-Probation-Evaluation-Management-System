// =============================================================================
// src/api/auditApi.js
// Audit log API helpers.
// FR-18 | NFR-08
// =============================================================================

import api from './axiosInstance'

// SYSTEM_ADMIN: list audit log entries with optional search and filters
// Returns { data, pagination }
export const getAuditLogs = async ({ search = '', action_type = '', page = 1, limit = 25 } = {}) => {
  const params = { page, limit }
  if (search)      params.search      = search
  if (action_type) params.action_type = action_type
  const res = await api.get('/audit', { params })
  return res.data
}
