// =============================================================================
// src/api/employeeApi.js
// API calls for employee and department management.
// FR-01, FR-04
// =============================================================================

import api from './axiosInstance'

// ── Departments ────────────────────────────────────────────────────────────

export const getDepartments = () =>
  api.get('/departments').then((r) => r.data.data)

export const createDepartment = (payload) =>
  api.post('/departments', payload).then((r) => r.data)

// ── Employees ──────────────────────────────────────────────────────────────

export const getEmployees = () =>
  api.get('/employees').then((r) => r.data.data)

export const getEmployee = (profileId) =>
  api.get(`/employees/${profileId}`).then((r) => r.data.data)

export const createEmployee = (payload) =>
  api.post('/employees', payload).then((r) => r.data)

export const updateEmployeeProfile = (profileId, payload) =>
  api.put(`/employees/${profileId}/profile`, payload).then((r) => r.data)

// Employee self-service: fetch own profile (uses auth/me which returns employeeProfile)
export const getMyEmployeeProfile = () =>
  api.get('/auth/me').then((r) => r.data)

// Employee self-service: update only the fields employees are permitted to change
// (personal_email, emergency contact, education, previous job title)
export const updateMyProfile = (payload) =>
  api.patch('/employees/me/profile', payload).then((r) => r.data)

// Self-service profile image upload — NEW_EMPLOYEE, LINE_MANAGER, HR_ADMIN, DIRECTOR
// Expects a FormData object with a 'profile_image' file field.
export const uploadMyAvatar = (formData) =>
  api.patch('/employees/me/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)

export const toggleUserStatus = (userId, is_active) =>
  api.patch(`/employees/${userId}/status`, { is_active }).then((r) => r.data)

export const getManagers = () =>
  api.get('/employees/managers').then((r) => r.data.data)

// ── SYSTEM_ADMIN — all users (FR-01) ─────────────────────────────────────────

export const getAllUsers = () =>
  api.get('/employees/all-users').then((r) => r.data.data)

// ── Department manager assignment (Block 3 / lecturer requirement) ─────────

/** Assign a LINE_MANAGER as the dedicated manager of a department. */
export const assignDepartmentManager = (departmentId, managerId) =>
  api.patch(`/departments/${departmentId}/manager`, { manager_id: managerId }).then((r) => r.data)

/** Remove the current manager from a department. */
export const removeDepartmentManager = (departmentId) =>
  api.delete(`/departments/${departmentId}/manager`).then((r) => r.data)

/** Update department name/description. */
export const updateDepartment = (departmentId, payload) =>
  api.put(`/departments/${departmentId}`, payload).then((r) => r.data)

