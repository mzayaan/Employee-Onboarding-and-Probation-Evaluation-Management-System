// =============================================================================
// src/api/performanceNoteApi.js
// Performance note API helpers — wraps Axios calls to /api/performance-notes
// FR-12 | Objective 2
// =============================================================================

import api from './axiosInstance'

// Create a performance note for a given employee profile
export const createNote = async (payload) => {
  const res = await api.post('/performance-notes', payload)
  return res.data.data
}

// Retrieve all notes for a specific employee profile
export const getNotesByProfile = async (profileId) => {
  const res = await api.get(`/performance-notes/profile/${profileId}`)
  return res.data.data
}

// Update a note — accepts either a plain string (backward-compat) or a full payload object
export const updateNote = async (noteId, payloadOrText) => {
  const body = typeof payloadOrText === 'string'
    ? { note_text: payloadOrText }
    : payloadOrText
  const res = await api.patch(`/performance-notes/${noteId}`, body)
  return res.data.data
}

// Delete a note
export const deleteNote = async (noteId) => {
  const res = await api.delete(`/performance-notes/${noteId}`)
  return res.data
}

// ── Employee-facing helpers ───────────────────────────────────────────────────

// Employee: list all notes on own profile
export const getMyNotes = async () => {
  const res = await api.get('/performance-notes/my')
  return res.data.data
}

// Employee: submit an EMPLOYEE_FEEDBACK note
export const addEmployeeFeedback = async (note_text, evaluation_period_id = null) => {
  const res = await api.post('/performance-notes/my/feedback', {
    note_text,
    evaluation_period_id,
  })
  return res.data.data
}

// Employee: add a response to a specific note
export const respondToNote = async (noteId, employee_response) => {
  const res = await api.patch(`/performance-notes/${noteId}/respond`, {
    employee_response,
  })
  return res.data.data
}
