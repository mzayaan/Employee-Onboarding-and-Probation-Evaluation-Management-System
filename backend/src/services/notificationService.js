// =============================================================================
// src/services/notificationService.js
// Scheduled email notification jobs using node-cron.
// Runs daily at 08:00 to detect overdue tasks and upcoming evaluation deadlines.
// FR-09 | NFR-02
// =============================================================================

const cron = require('node-cron');
const { Op }  = require('sequelize');

const {
  sendOverdueTaskEmail,
  sendEvaluationReminderEmail,
  sendPendingDocumentReminderEmail,
} = require('../utils/mailer');

// Models are loaded lazily (after sequelize.sync) so we require inside functions
// to avoid circular dependency issues at startup.

// ── Helper: days between today and a target date ──────────────────────────────
const daysUntil = (targetDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
};


// ── createNotification ────────────────────────────────────────────────────────
// Saves an in-app notification record.
// Call this from any controller when a significant event occurs.
// FR-09 | Objective 1 & 2
const createNotification = async ({ userId, type, message, relatedEntityType = null, relatedEntityId = null }) => {
  try {
    const { Notification } = require('../models');
    await Notification.create({
      user_id:             userId,
      type,
      message,
      related_entity_type: relatedEntityType,
      related_entity_id:   relatedEntityId,
      is_read:             false,
    });
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[notificationService.createNotification]', err.message);
  }
};

// ── Job 1: Overdue task notifications ─────────────────────────────────────────
// Finds all task assignments whose due_date is in the past and status is not
// COMPLETED, groups them by assigned employee and sends one summary email each.
const runOverdueTaskNotifications = async () => {
  try {
    const {
      TaskAssignment,
      OnboardingTask,
      User,
      EmployeeProfile,
    } = require('../models');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find overdue, incomplete task assignments.
    // due_date lives on TaskAssignment, not on OnboardingTask.
    const overdueAssignments = await TaskAssignment.findAll({
      where: {
        status: { [Op.in]: ['TODO', 'IN_PROGRESS'] },
        due_date: { [Op.lt]: today },
      },
      include: [
        {
          model: OnboardingTask,
          as: 'task',
          attributes: ['title'],
        },
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          attributes: ['profile_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'email', 'first_name'],
            },
          ],
        },
      ],
    });

    if (!overdueAssignments.length) return;

    // Group by employee user_id — one summary email per employee.
    const byEmployee = {};
    for (const assignment of overdueAssignments) {
      const employeeUser = assignment.employeeProfile?.user;
      if (!employeeUser?.email) continue;

      const uid = employeeUser.user_id;
      if (!byEmployee[uid]) {
        byEmployee[uid] = {
          email: employeeUser.email,
          firstName: employeeUser.first_name,
          tasks: [],
        };
      }
      byEmployee[uid].tasks.push({
        title:    assignment.task?.title || 'Onboarding task',
        due_date: assignment.due_date,
      });
    }

    // Send one email per employee
    for (const { email, firstName, tasks } of Object.values(byEmployee)) {
      await sendOverdueTaskEmail({ to: email, firstName, tasks });

      // Also create in-app notification record
      const { User } = require('../models');
      const userRecord = await User.findOne({ where: { email }, attributes: ['user_id'] });
      if (userRecord) {
        await createNotification({
          userId:  userRecord.user_id,
          type:    'TASK_OVERDUE',
          message: `You have ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''}. Please complete them as soon as possible.`,
          relatedEntityType: 'task',
        });
      }
    }

    console.log(`[Notifications] Overdue task emails sent to ${Object.keys(byEmployee).length} employee(s).`);
  } catch (err) {
    console.error('[Notifications] Overdue task job failed:', err.message);
  }
};

// ── Job 2: Evaluation deadline reminders ──────────────────────────────────────
// Finds evaluation checkpoints due in exactly 3 or 1 day(s) and emails the
// responsible line manager.
const REMINDER_DAYS = [3, 1];

const runEvaluationDeadlineReminders = async () => {
  try {
    const {
      EvaluationCheckpoint,
      EmployeeProfile,
      ProbationPeriod,
      User,
    } = require('../models');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build list of target dates (today + 3, today + 1)
    const targetDates = REMINDER_DAYS.map((d) => {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + d);
      return dt;
    });

    const checkpoints = await EvaluationCheckpoint.findAll({
      where: {
        due_date: { [Op.in]: targetDates },
        status:   'PENDING',          // ENUM: 'PENDING' | 'COMPLETED' | 'OVERDUE'
      },
      include: [
        {
          model: ProbationPeriod,
          as: 'probationPeriod',
          include: [
            {
              model: EmployeeProfile,
              as: 'employeeProfile',
              include: [
                {
                  model: User,
                  as: 'user',           // employee's own User record
                  attributes: ['first_name', 'last_name'],
                },
                {
                  model: User,
                  as: 'manager',        // line manager — alias defined in index.js
                  attributes: ['email', 'first_name'],
                },
              ],
            },
          ],
        },
      ],
    });

    for (const checkpoint of checkpoints) {
      const profile = checkpoint.probationPeriod?.employeeProfile;
      if (!profile) continue;

      const manager = profile.manager;
      if (!manager?.email) continue;

      const employeeFullName = `${profile.user.first_name} ${profile.user.last_name}`;
      const days = daysUntil(checkpoint.due_date);

      await sendEvaluationReminderEmail({
        to:               manager.email,
        managerFirstName: manager.first_name,
        employeeFullName,
        checkpointLabel:  checkpoint.checkpoint_label,
        dueDate:          checkpoint.due_date,
        daysUntilDue:     days,
      });

      // Also create in-app notification record for the manager
      const { User } = require('../models');
      const managerRecord = await User.findOne({ where: { email: manager.email }, attributes: ['user_id'] });
      if (managerRecord) {
        await createNotification({
          userId:  managerRecord.user_id,
          type:    'EVAL_DUE',
          message: `Evaluation due in ${days} day${days !== 1 ? 's' : ''}: ${checkpoint.checkpoint_label} for ${employeeFullName}.`,
          relatedEntityType: 'checkpoint',
          relatedEntityId:   checkpoint.checkpoint_id,
        });
      }
    }

    if (checkpoints.length) {
      console.log(`[Notifications] Evaluation reminder emails sent for ${checkpoints.length} checkpoint(s).`);
    }
  } catch (err) {
    console.error('[Notifications] Evaluation reminder job failed:', err.message);
  }
};

// ── Job 3: Flip overdue evaluation checkpoints ────────────────────────────────
// Any PENDING checkpoint whose due_date has passed is promoted to OVERDUE.
// FR-17/BUG-05 — runs daily before notification jobs so email counts are accurate.
const runFlipOverdueCheckpoints = async () => {
  try {
    const { EvaluationCheckpoint } = require('../models');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [affectedCount] = await EvaluationCheckpoint.update(
      { status: 'OVERDUE' },
      {
        where: {
          status:   'PENDING',
          due_date: { [Op.lt]: today },
        },
      }
    );

    if (affectedCount > 0) {
      console.log(`[Notifications] ${affectedCount} checkpoint(s) flipped PENDING → OVERDUE.`);
    }
  } catch (err) {
    console.error('[Notifications] Flip-overdue-checkpoints job failed:', err.message);
  }
};

// ── Job 4: Pending document submission reminders ──────────────────────────────
// Finds active employees who have at least one required document type with no
// submission at all (not even PENDING), and sends them a reminder email.
// FR-09: "pending document submissions"
const runPendingDocumentReminders = async () => {
  try {
    const {
      EmployeeProfile,
      DocumentType,
      OnboardingDocument,
      User,
    } = require('../models');

    // Load all required document types once
    const requiredTypes = await DocumentType.findAll({
      where: { is_required: true },
      attributes: ['type_id', 'name'],
    });
    if (!requiredTypes.length) return;

    // Load all active employees with their document submissions
    const profiles = await EmployeeProfile.findAll({
      where: { onboarding_status: 'IN_PROGRESS' },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['email', 'first_name'],
          where: { is_active: true },
        },
        {
          model: OnboardingDocument,
          as: 'documents',
          attributes: ['document_type_id'],
          required: false,
        },
      ],
    });

    for (const profile of profiles) {
      const submittedTypeIds = new Set(
        (profile.documents || []).map((d) => d.document_type_id)
      );

      // Find required types that have NO submission at all
      const missing = requiredTypes.filter(
        (rt) => !submittedTypeIds.has(rt.type_id)
      );
      if (!missing.length) continue;

      await sendPendingDocumentReminderEmail({
        to:           profile.user.email,
        firstName:    profile.user.first_name,
        pendingTypes: missing.map((rt) => ({ name: rt.name })),
      });
    }

    console.log(`[Notifications] Pending document reminder job completed for ${profiles.length} profile(s) checked.`);
  } catch (err) {
    console.error('[Notifications] Pending document reminder job failed:', err.message);
  }
};

// ── Register cron jobs ─────────────────────────────────────────────────────────
// Runs every day at 08:00 server time.
// Order: flip overdue first so that emails reflect correct OVERDUE counts.
const startNotificationScheduler = () => {
  cron.schedule('0 8 * * *', async () => {
    console.log('[Notifications] Running daily notification jobs…');
    await runFlipOverdueCheckpoints();       // must run first — FR-17/BUG-05
    await runOverdueTaskNotifications();
    await runEvaluationDeadlineReminders();
    await runPendingDocumentReminders();
  });

  console.log('[Notifications] Scheduler registered — daily at 08:00.');
};

module.exports = {
  createNotification,
  startNotificationScheduler,
  runFlipOverdueCheckpoints,
  runOverdueTaskNotifications,
  runEvaluationDeadlineReminders,
  runPendingDocumentReminders,
};
