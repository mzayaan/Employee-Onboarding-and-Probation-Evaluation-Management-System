// =============================================================================
// src/api/evaluationApi.js
// Probation evaluation API helpers.
// FR-11, FR-12, FR-13, FR-14, FR-15 | Objectives 2, 3
// =============================================================================

import api from './axiosInstance'

// Manager: get own team overview
export const getMyTeam = async () => {
  const res = await api.get('/evaluations/manager/my-team')
  return res.data.data
}

// HR Admin / Manager: get probation period + checkpoints for an employee
export const getProbationByProfile = async (profileId) => {
  const res = await api.get(`/evaluations/probation/${profileId}`)
  return res.data.data
}

// Employee: get own probation period + checkpoints
export const getMyProbation = async () => {
  const res = await api.get('/evaluations/my-probation')
  return res.data.data
}

// Any authorised role: get full checkpoint detail (criteria + existing evaluation)
export const getCheckpoint = async (checkpointId) => {
  const res = await api.get(`/evaluations/checkpoint/${checkpointId}`)
  return res.data
}

// Manager / HR Admin: submit manager evaluation
export const submitManagerEvaluation = async (checkpointId, payload) => {
  const res = await api.post(`/evaluations/checkpoint/${checkpointId}/manager`, payload)
  return res.data
}

// Employee: submit self-assessment
export const submitSelfAssessment = async (checkpointId, payload) => {
  const res = await api.post(`/evaluations/checkpoint/${checkpointId}/self`, payload)
  return res.data
}
