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
