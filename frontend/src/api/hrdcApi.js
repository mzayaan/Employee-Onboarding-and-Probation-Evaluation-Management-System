// =============================================================================
// src/api/hrdcApi.js
// API calls for HRDC training log management.
//
// Endpoints served by the backend HRDCTrainingLog model (hrdc_training_logs table).
// Used by HR Admins to record, view and export HRDC G1 training data.
//
// FR-NEW-01 | Objective 1 (extended)
// =============================================================================

import api from './axiosInstance'

/**
 * Fetch all HRDC training log entries.
 * HR Admin access only.
 */
export const getTrainingLogs = () =>
  api.get('/hrdc-training').then((r) => r.data.data)

/**
 * Fetch training log entries for a specific employee profile.
 * HR Admin access only.
 */
export const getTrainingLogsByProfile = (profileId) =>
  api.get(`/hrdc-training/profile/${profileId}`).then((r) => r.data.data)

/**
 * Add a new HRDC training log entry.
 *
 * Payload shape:
 * {
 *   profile_id: number,
 *   course_name: string,
 *   training_provider: string,
 *   hrdc_approved_course_code?: string,
 *   training_cost: number,      // MUR
 *   duration_hours: number,
 *   completed_date: 'YYYY-MM-DD',
 * }
 */
export const addTrainingLog = (payload) =>
  api.post('/hrdc-training', payload).then((r) => r.data)

/**
 * Delete a training log entry (HR Admin only).
 */
export const deleteTrainingLog = (trainingId) =>
  api.delete(`/hrdc-training/${trainingId}`).then((r) => r.data)

/**
 * Download the HRDC G1 Training Log PDF export.
 * Returns a Blob (application/pdf) ready for client-side download.
 * HR Admin access only.
 */
export const downloadHRDCG1Export = () =>
  api.get('/hrdc-training/export/g1', { responseType: 'blob' }).then((r) => r.data)
