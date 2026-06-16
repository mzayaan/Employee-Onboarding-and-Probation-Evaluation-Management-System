// =============================================================================
// src/routes/notificationRoutes.js
// Manual trigger endpoint for scheduled notification jobs (dev/testing only).
// FR-09 | Objective 1 & 2
// =============================================================================

const express    = require('express');
const router     = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  runOverdueTaskNotifications,
  runEvaluationDeadlineReminders,
  runPendingDocumentReminders,
} = require('../services/notificationService');

router.use(authenticate);

/**
 * POST /api/notifications/trigger
 * Body: { "job": "overdue_tasks" | "evaluation_reminders" | "pending_documents" | "all" }
 * Manually fires a scheduled notification job for testing purposes.
 * Restricted to HR_ADMIN only.
 */
router.post('/trigger', authorize('HR_ADMIN'), async (req, res) => {
  const { job } = req.body;

  const validJobs = ['overdue_tasks', 'evaluation_reminders', 'pending_documents', 'all'];
  if (!job || !validJobs.includes(job)) {
    return res.status(400).json({
      message: `Invalid job. Must be one of: ${validJobs.join(', ')}`,
    });
  }

  try {
    if (job === 'overdue_tasks' || job === 'all') {
      await runOverdueTaskNotifications();
    }
    if (job === 'evaluation_reminders' || job === 'all') {
      await runEvaluationDeadlineReminders();
    }
    if (job === 'pending_documents' || job === 'all') {
      await runPendingDocumentReminders();
    }

    return res.status(200).json({
      message: `Notification job "${job}" triggered successfully.`,
    });
  } catch (err) {
    console.error('[Notifications] Manual trigger error:', err.message);
    return res.status(500).json({ message: 'Notification job failed.', error: err.message });
  }
});

module.exports = router;
