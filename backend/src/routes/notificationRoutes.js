// =============================================================================
// src/routes/notificationRoutes.js
// In-app notification endpoints (FR-09) + dev trigger for scheduled jobs.
// FR-09 | NFR-02, NFR-03
// =============================================================================

const express    = require('express');
const router     = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require('../controllers/notificationController');

const {
  runOverdueTaskNotifications,
  runEvaluationDeadlineReminders,
  runPendingDocumentReminders,
} = require('../services/notificationService');

router.use(authenticate);

// ── User-facing in-app notification endpoints (all authenticated roles) ───────

// GET  /api/notifications               — list own notifications (newest first)
router.get('/', getMyNotifications);

// GET  /api/notifications/unread-count  — lightweight badge poll
router.get('/unread-count', getUnreadCount);

// PATCH /api/notifications/read-all     — mark all as read
router.patch('/read-all', markAllAsRead);

// PATCH /api/notifications/:id/read     — mark one as read
router.patch('/:id/read', markAsRead);

// ── Dev/test trigger (HR_ADMIN only) ─────────────────────────────────────────
/**
 * POST /api/notifications/trigger
 * Body: { "job": "overdue_tasks" | "evaluation_reminders" | "pending_documents" | "all" }
 */
router.post('/trigger', authorize('HR_ADMIN'), async (req, res) => {
  const { job } = req.body;
  const validJobs = ['overdue_tasks', 'evaluation_reminders', 'pending_documents', 'all'];
  if (!job || !validJobs.includes(job)) {
    return res.status(400).json({ message: `Invalid job. Must be one of: ${validJobs.join(', ')}` });
  }

  try {
    if (job === 'overdue_tasks'       || job === 'all') await runOverdueTaskNotifications();
    if (job === 'evaluation_reminders'|| job === 'all') await runEvaluationDeadlineReminders();
    if (job === 'pending_documents'   || job === 'all') await runPendingDocumentReminders();
    return res.json({ message: `Notification job "${job}" triggered successfully.` });
  } catch (err) {
    console.error('[Notifications] Manual trigger error:', err.message);
    return res.status(500).json({ message: 'Notification job failed.', error: err.message });
  }
});

module.exports = router;
