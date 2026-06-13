// =============================================================================
// src/api/criteriaApi.js
// Evaluation criteria API helpers — wraps Axios calls to /api/criteria
// FR-10 | Objective 2
// =============================================================================

import api from './axiosInstance'

// List all criteria
export const getCriteria = async () => {
  const res = await api.get('/criteria')
  return res.data.data
}

// Create a new criterion
export const createCriterion = async (payload) => {
  const res = await api.post('/criteria', payload)
  return res.data.data
}

// Update an existing criterion
export const updateCriterion = async (id, payload) => {
  const res = await api.put(`/criteria/${id}`, payload)
  return res.data.data
}

// Deactivate (soft-delete) a criterion
export const deactivateCriterion = async (id) => {
  const res = await api.delete(`/criteria/${id}`)
  return res.data
}
