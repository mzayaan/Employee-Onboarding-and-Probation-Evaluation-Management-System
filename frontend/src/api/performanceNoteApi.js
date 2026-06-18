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

// Update the text of an existing note
export const updateNote = async (noteId, noteText) => {
  const res = await api.patch(`/performance-notes/${noteId}`, { note_text: noteText })
  return res.data.data
}

// Delete a note
export const deleteNote = async (noteId) => {
  const res = await api.delete(`/performance-notes/${noteId}`)
  return res.data
}
