// =============================================================================
// src/api/directorApi.js
// API calls for the three-stage probation approval workflow.
//
// Endpoints served by directorRoutes.js / directorController.js.
// FR-15, FR-16, FR-20 | Objective 3
// =============================================================================

import api from './axiosInstance'

// ── Queue lists ────────────────────────────────────────────────────────────

/** HR queue: recommendations with approval_status PENDING_HR_REVIEW or RETURNED_TO_MANAGER */
export const listPendingHR = () =>
  api.get('/director/pending-hr').then((r) => r.data.data)

/** Director queue: recommendations with approval_status PENDING_DIRECTOR */
export const listPendingDirector = () =>
  api.get('/director/pending-director').then((r) => r.data.data)

/** All recommendations — HR + Director overview */
export const listAllRecommendations = () =>
  api.get('/director/all').then((r) => r.data.data)

// ── Single recommendation ──────────────────────────────────────────────────

/** Full recommendation detail including evaluation scores, employee profile, period. */
export const getRecommendation = (recId) =>
  api.get(`/director/recommendation/${recId}`).then((r) => r.data.data)

// ── HR actions ─────────────────────────────────────────────────────────────

/**
 * HR endorses a recommendation → PENDING_DIRECTOR
 * @param {number} recId
 * @param {{ hr_endorsement_notes?: string }} body
 */
export const endorseRecommendation = (recId, body = {}) =>
  api.post(`/director/${recId}/endorse`, body).then((r) => r.data)

/**
 * HR returns a recommendation to the manager → RETURNED_TO_MANAGER
 * @param {number} recId
 * @param {{ hr_endorsement_notes: string }} body  — notes are required
 */
export const returnToManagerByHR = (recId, body) =>
  api.post(`/director/${recId}/return-to-manager`, body).then((r) => r.data)

/**
 * Manager resubmits a returned recommendation → PENDING_HR_REVIEW
 * @param {number} recId
 * @param {{ justification: string }} body
 */
export const resubmitRecommendation = (recId, body) =>
  api.post(`/director/${recId}/resubmit`, body).then((r) => r.data)

// ── Director actions ───────────────────────────────────────────────────────

/**
 * Director approves recommendation → APPROVED; ProbationPeriod status updated
 * @param {number} recId
 * @param {{ director_reason?: string }} body
 */
export const approveRecommendation = (recId, body = {}) =>
  api.post(`/director/${recId}/approve`, body).then((r) => r.data)

/**
 * Director returns recommendation to manager → RETURNED_TO_MANAGER
 * @param {number} recId
 * @param {{ director_reason: string }} body  — reason is required
 */
export const returnByDirector = (recId, body) =>
  api.post(`/director/${recId}/return`, body).then((r) => r.data)
