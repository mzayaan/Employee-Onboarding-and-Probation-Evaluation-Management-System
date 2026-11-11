// =============================================================================
// src/api/leaveBalanceApi.js
// API calls for WRA 2019 employee leave balances.
//
// Leave entitlements are governed by the Workers' Rights Act 2019:
//   Annual Leave     — s.45: 22 working days per year
//   Sick Leave       — s.46: 15 days, accumulates up to 90 days
//   Vacation Leave   — s.47: 30 days over 5 years (≈6/yr) for employees
//                            earning ≤ MUR 50,000 per month
//
// FR-04 (extended) | WRA 2019 s.45–47 | NFR-03 | Objective 1
// =============================================================================

import api from './axiosInstance'

/**
 * Fetch the WRA leave balance for the authenticated NEW_EMPLOYEE (self-service).
 * Returns null when no balance record exists for this employee.
 */
export const getMyLeaveBalance = () =>
  api.get('/employees/me/leave-balance')
    .then((r) => r.data.data)
    .catch((err) => {
      if (err?.response?.status === 404) return null
      throw err
    })

/**
 * HR Admin / Line Manager: fetch the WRA leave balance for a specific employee
 * by their EmployeeProfile ID.
 * Returns null when no balance record exists.
 */
export const getLeaveBalanceByProfile = (profileId) =>
  api.get(`/employees/${profileId}/leave-balance`)
    .then((r) => r.data.data)
    .catch((err) => {
      if (err?.response?.status === 404) return null
      throw err
    })
