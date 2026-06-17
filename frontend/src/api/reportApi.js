// =============================================================================
// src/api/reportApi.js
// PDF evaluation report API helpers.
// FR-16 | Objective 3
// =============================================================================

import api from './axiosInstance'

/**
 * Downloads the PDF evaluation report for a given probation period.
 * Returns a Blob that can be used to trigger a browser file download.
 * @param {number|string} periodId — the ProbationPeriod.period_id
 */
export const downloadReport = async (periodId) => {
  const res = await api.get(`/reports/period/${periodId}`, {
    responseType: 'blob',
  })
  return res.data
}
