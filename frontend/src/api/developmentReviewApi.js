// =============================================================================
// src/api/developmentReviewApi.js
// Development Review API helpers — wraps Axios calls to /api/development-reviews
// FR-12 | Objective 2
// =============================================================================

import api from './axiosInstance'

// Create a development review for a given employee profile
export const createReview = async (payload) => {
  const res = await api.post('/development-reviews', payload)
  return res.data.data
}

// Retrieve all development reviews for a specific employee profile
export const getReviewsByProfile = async (profileId) => {
  const res = await api.get(`/development-reviews/profile/${profileId}`)
  return res.data.data
}

// Get a single development review by ID
export const getReviewById = async (reviewId) => {
  const res = await api.get(`/development-reviews/${reviewId}`)
  return res.data.data
}

// Update a development review
export const updateReview = async (reviewId, payload) => {
  const res = await api.patch(`/development-reviews/${reviewId}`, payload)
  return res.data.data
}

// Delete a development review
export const deleteReview = async (reviewId) => {
  const res = await api.delete(`/development-reviews/${reviewId}`)
  return res.data
}

// ── Employee-facing helpers ───────────────────────────────────────────────────

// Employee: list own development reviews
export const getMyDevelopmentReviews = async () => {
  const res = await api.get('/development-reviews/my')
  return res.data.data
}

// Employee: acknowledge a development review
export const acknowledgeReview = async (reviewId, acknowledgement_date) => {
  const res = await api.patch(`/development-reviews/${reviewId}/acknowledge`, {
    employee_acknowledgement_date: acknowledgement_date || null,
  })
  return res.data.data
}
