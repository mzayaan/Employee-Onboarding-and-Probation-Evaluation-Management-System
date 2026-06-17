// =============================================================================
// src/controllers/notificationController.js
// In-app notification CRUD for the authenticated user.
// FR-09 | NFR-02, NFR-03
// =============================================================================

const { Notification } = require('../models');
const { Op } = require('sequelize');

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns all notifications for the authenticated user, newest first.
// Optionally filter by ?unread=true
const getMyNotifications = async (req, res) => {
  const userId  = req.user.user_id;
  const unreadOnly = req.query.unread === 'true';

  const where = { user_id: userId };
  if (unreadOnly) where.is_read = false;

  try {
    const notifications = await Notification.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 100,
    });

    const unreadCount = await Notification.count({
      where: { user_id: userId, is_read: false },
    });

    return res.json({ success: true, data: notifications, unreadCount });
  } catch (error) {
    console.error('[notificationController.getMyNotifications]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve notifications.' });
  }
};

// ── GET /api/notifications/unread-count ──────────────────────────────────────
// Lightweight endpoint polled by the bell icon badge.
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.count({
      where: { user_id: req.user.user_id, is_read: false },
    });
    return res.json({ success: true, unreadCount: count });
  } catch (error) {
    console.error('[notificationController.getUnreadCount]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to get unread count.' });
  }
};

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
// Marks a single notification as read. Only the owner can mark their own.
const markAsRead = async (req, res) => {
  const userId = req.user.user_id;
  const notifId = parseInt(req.params.id, 10);

  if (isNaN(notifId)) {
    return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
  }

  try {
    const notif = await Notification.findOne({
      where: { notification_id: notifId, user_id: userId },
    });

    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    await notif.update({ is_read: true });
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    console.error('[notificationController.markAsRead]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update notification.' });
  }
};

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
// Marks ALL unread notifications for the authenticated user as read.
const markAllAsRead = async (req, res) => {
  try {
    await Notification.update(
      { is_read: true },
      { where: { user_id: req.user.user_id, is_read: false } }
    );
    return res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('[notificationController.markAllAsRead]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
