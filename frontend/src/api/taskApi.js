// =============================================================================
// src/api/taskApi.js
// Task assignment API helpers — wraps Axios calls to /api/tasks
// FR-07, FR-08 | Objective 1
// =============================================================================

import api from './axiosInstance'

// Assign a task to an employee (HR / Manager)
export const assignTask = async (payload) => {
  const res = await api.post('/tasks/assign', payload)
  return res.data.data
}

// Employee: view own tasks
export const getMyTasks = async () => {
  const res = await api.get('/tasks/my')
  return res.data.data
}

// HR / Manager: view all task assignments (optional profileId filter)
export const getAllAssignments = async (profileId = null) => {
  const params = profileId ? { profile_id: profileId } : {}
  const res = await api.get('/tasks/assignments', { params })
  return res.data.data
}

// HR / Manager: view tasks + progress for one employee
export const getAssignmentsByEmployee = async (profileId) => {
  const res = await api.get(`/tasks/assignments/employee/${profileId}`)
  return res.data   // { data, summary }
}

// Update task status
export const updateTaskStatus = async (assignmentId, status) => {
  const res = await api.patch(`/tasks/assignments/${assignmentId}/status`, { status })
  return res.data.data
}

// Delete a task assignment (HR only)
export const deleteAssignment = async (assignmentId) => {
  const res = await api.delete(`/tasks/assignments/${assignmentId}`)
  return res.data
}
