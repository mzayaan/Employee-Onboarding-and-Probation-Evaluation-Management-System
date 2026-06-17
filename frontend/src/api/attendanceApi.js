// =============================================================================
// src/api/attendanceApi.js
// Attendance record API calls — FR-12
// =============================================================================

import api from './axiosInstance'

/**
 * Add an attendance record for a probation period.
 * @param {{ period_id: number, record_date: string, status: string, notes?: string }} data
 */
export const addAttendanceRecord = (data) =>
  api.post('/attendance', data).then((r) => r.data.data)

/**
 * Get all attendance records for a probation period.
 * @param {number} periodId
 */
export const getAttendanceByPeriod = (periodId) =>
  api.get(`/attendance/period/${periodId}`).then((r) => r.data.data)

/**
 * Get an aggregated attendance summary for a probation period.
 * Optionally scoped to a date window.
 * @param {number} periodId
 * @param {{ from?: string, to?: string }} params
 */
export const getAttendanceSummary = (periodId, params = {}) => {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to)   query.set('to',   params.to)
  const qs = query.toString()
  return api
    .get(`/attendance/period/${periodId}/summary${qs ? `?${qs}` : ''}`)
    .then((r) => r.data.data)
}
