// =============================================================================
// src/api/documentApi.js
// API calls for document submission and verification.
// FR-05, FR-06 | Objective 1
// =============================================================================

import api from './axiosInstance'

// ── Shared ─────────────────────────────────────────────────────────────────

export const getDocumentTypes = () =>
  api.get('/documents/types').then((r) => r.data.data)

// ── Employee ────────────────────────────────────────────────────────────────

/**
 * Upload a document. Payload must be FormData with fields:
 *   document_type_id  (string)
 *   document          (File)
 */
export const uploadDocument = (formData) =>
  api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

export const getMyDocuments = () =>
  api.get('/documents/my').then((r) => r.data.data)

// ── HR ──────────────────────────────────────────────────────────────────────

export const getAllDocuments = (status = '') => {
  const params = status ? { status } : {}
  return api.get('/documents', { params }).then((r) => r.data.data)
}

export const getDocumentsByEmployee = (profileId) =>
  api.get(`/documents/employee/${profileId}`).then((r) => r.data.data)

export const verifyDocument = (documentId, payload) =>
  api.patch(`/documents/${documentId}/verify`, payload).then((r) => r.data)
