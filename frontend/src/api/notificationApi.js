// =============================================================================
// src/api/notificationApi.js
// In-app notification API calls.
// FR-09 | Objective 1 & 2
// =============================================================================

import api from './axiosInstance'

// GET  /api/notifications — list own notifications
export const getNotifications = (unreadOnly = false) =>
  api.get('/notifications', { params: unreadOnly ? { unread: 'true' } : {} })
     .then((r) => r.data)

// GET  /api/notifications/unread-count — badge count
export const getUnreadCount = () =>
  api.get('/notifications/unread-count').then((r) => r.data.unreadCount)

// PATCH /api/notifications/:id/read
export const markAsRead = (id) =>
  api.patch(`/notifications/${id}/read`).then((r) => r.data)

// PATCH /api/notifications/read-all
export const markAllAsRead = () =>
  api.patch('/notifications/read-all').then((r) => r.data)
