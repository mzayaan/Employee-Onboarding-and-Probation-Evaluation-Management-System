// =============================================================================
// src/api/contractApi.js
// API calls for employee contract records.
//
// MRA tax declaration calls have been moved to taxDeclarationApi.js.
//
// FR-04 (extended) | WRA 2019 s.13
// =============================================================================

import api from './axiosInstance'

// ── Contract ──────────────────────────────────────────────────────────────────

/**
 * Fetch the contract record for the authenticated employee (NEW_EMPLOYEE role).
 * Returns null when no contract has been linked yet (graceful empty state).
 */
export const getMyContract = () =>
  api.get('/contracts/mine')
    .then((r) => r.data.data)
    .catch((err) => {
      if (err?.response?.status === 404) return null
      throw err
    })

/**
 * HR Admin: fetch the contract record for a specific employee profile.
 */
export const getContractByProfile = (profileId) =>
  api.get(`/contracts/profile/${profileId}`).then((r) => r.data.data)

/**
 * HR Admin: create a new contract record for an employee.
 */
export const createContract = (payload) =>
  api.post('/contracts', payload).then((r) => r.data)

/**
 * Employee: submit a signed contract acknowledgement.
 * Payload: { signature_string, signature_timestamp }
 * The backend captures the IP from the request and persists the signed_at.
 */
export const signContract = (contractId, payload) =>
  api.patch(`/contracts/${contractId}/sign`, payload).then((r) => r.data)

// MRA Employee Tax Declaration functions have been moved to taxDeclarationApi.js
