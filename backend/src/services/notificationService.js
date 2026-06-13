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
        checkpointLabel:  checkpoint.checkpoint_label,   // correct field name
        dueDate:          checkpoint.due_date,
        daysUntilDue:     days,
      });
    }

    if (checkpoints.length) {
      console.log(`[Notifications] Evaluation reminder emails sent for ${checkpoints.length} checkpoint(s).`);
    }
  } catch (err) {
    console.error('[Notifications] Evaluation reminder job failed:', err.message);
  }
};

// ── Register cron jobs ─────────────────────────────────────────────────────────
// Runs every day at 08:00 server time.
const startNotificationScheduler = () => {
  cron.schedule('0 8 * * *', async () => {
    console.log('[Notifications] Running daily notification jobs…');
    await runOverdueTaskNotifications();
    await runEvaluationDeadlineReminders();
  });

  console.log('[Notifications] Scheduler registered — daily at 08:00.');
};

module.exports = { startNotificationScheduler };
