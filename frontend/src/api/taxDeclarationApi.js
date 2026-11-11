// =============================================================================
// src/api/taxDeclarationApi.js
// API calls for MRA Employee Tax Declarations (EDF).
//
// Extracted from contractApi.js for architectural consistency — each domain
// has its own API module.
//
// FR-04 (extended) | FR-NEW-02 (MRA EDF) | WRA 2019 s.13 | Objective 1
// =============================================================================

import api from './axiosInstance'

/**
 * Fetch the existing MRA tax declaration for the authenticated employee.
 * Returns null when no declaration has been submitted yet (graceful empty state).
 */
export const getMyTaxDeclaration = () =>
  api.get('/tax-declarations/mine')
    .then((r) => r.data.data)
    .catch((err) => {
      if (err?.response?.status === 404) return null
      throw err
    })

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
