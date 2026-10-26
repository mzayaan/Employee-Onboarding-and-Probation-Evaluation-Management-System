// =============================================================================
// src/api/contractApi.js
// API calls for employee contract records and MRA tax declarations.
//
// Endpoints served by the backend Contract model (contracts table).
//
// FR-04 (extended) | FR-NEW-02 (MRA EDF) | WRA 2019 s.13
// =============================================================================

import api from './axiosInstance'

// ── Contract ──────────────────────────────────────────────────────────────────

/**
 * Fetch the contract record for the authenticated employee (NEW_EMPLOYEE role).
 * Returns null/404 when no contract has been linked yet.
 */
export const getMyContract = () =>
  api.get('/contracts/mine').then((r) => r.data.data)

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

// ── MRA Employee Tax Declaration ──────────────────────────────────────────────

/**
 * Fetch the existing MRA tax declaration for the authenticated employee.
 * Returns null when no declaration has been submitted yet.
 */
export const getMyTaxDeclaration = () =>
  api.get('/tax-declarations/mine').then((r) => r.data.data)

/**
 * Submit or update the MRA Employee Declaration Form (EDF) for the
 * authenticated employee.
 *
 * Payload shape:
 * {
 *   declaration_category: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G',
 *   num_dependants: number,
 *   spouse_employed: boolean,
 *   declaration_date: 'YYYY-MM-DD',
 * }
 */
export const submitTaxDeclaration = (payload) =>
  api.post('/tax-declarations', payload).then((r) => r.data)
