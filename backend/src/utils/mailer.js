// =============================================================================
// src/utils/mailer.js
// Nodemailer transporter and email helper functions.
// Credentials loaded from environment variables — never hard-coded.
// FR-09 | NFR-02
// =============================================================================

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a plain/HTML email.
 * Silently logs errors rather than crashing — email is non-critical.
 */
const sendMail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || '"HR Onboard" <noreply@hronboard.dev>',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[Mailer] Failed to send email to', to, '—', err.message);
  }
};

// ── Template helpers ──────────────────────────────────────────────────────────

/**
 * Notify employee that a document was approved.
 */
const sendDocumentApprovedEmail = async ({ to, firstName, documentTypeName }) => {
  await sendMail({
    to,
    subject: 'Your document has been approved',
    html: `
      <p>Dear ${firstName},</p>
      <p>Your <strong>${documentTypeName}</strong> has been reviewed and <strong>approved</strong> by HR.</p>
      <p>Please log in to your HR Onboard portal to check your onboarding progress.</p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Notify employee that a document was rejected, with feedback.
 */
const sendDocumentRejectedEmail = async ({ to, firstName, documentTypeName, feedback }) => {
  await sendMail({
    to,
    subject: 'Action required: document submission rejected',
    html: `
      <p>Dear ${firstName},</p>
      <p>Your <strong>${documentTypeName}</strong> has been reviewed and <strong>rejected</strong> by HR.</p>
      <p><strong>Feedback from HR:</strong><br/>${feedback}</p>
      <p>Please log in to your HR Onboard portal and re-upload the document with the requested corrections.</p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Notify an employee that a task has been assigned to them.
 */
const sendTaskAssignedEmail = async ({ to, firstName, taskTitle, taskDescription, dueDate }) => {
  const dueDateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'No due date set';
  await sendMail({
    to,
    subject: `New onboarding task assigned: ${taskTitle}`,
    html: `
      <p>Dear ${firstName},</p>
      <p>A new onboarding task has been assigned to you:</p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Task:</td><td>${taskTitle}</td></tr>
        ${taskDescription ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Description:</td><td>${taskDescription}</td></tr>` : ''}
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Due date:</td><td>${dueDateStr}</td></tr>
      </table>
      <p>Please log in to your HR Onboard portal to view and manage your tasks.</p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Notify an employee that one or more of their tasks are overdue.
 * tasks: [{ title, due_date }]
 */
const sendOverdueTaskEmail = async ({ to, firstName, tasks }) => {
  const taskRows = tasks
    .map(
      (t) =>
        `<tr>
          <td style="padding:4px 12px 4px 0;">${t.title}</td>
          <td style="color:#dc2626;">${new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
        </tr>`
    )
    .join('');
  await sendMail({
    to,
    subject: 'Action required: overdue onboarding tasks',
    html: `
      <p>Dear ${firstName},</p>
      <p>The following onboarding task(s) assigned to you are now <strong>overdue</strong>:</p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <tr style="font-weight:bold;border-bottom:1px solid #e2e8f0;">
          <td style="padding:4px 12px 4px 0;">Task</td>
          <td>Due Date</td>
        </tr>
        ${taskRows}
      </table>
      <p>Please log in to your HR Onboard portal and complete these tasks as soon as possible.</p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Remind a manager that an evaluation checkpoint deadline is approaching.
 * daysUntilDue: number of days remaining
 */
const sendEvaluationReminderEmail = async ({
  to,
  managerFirstName,
  employeeFullName,
  checkpointLabel,
  dueDate,
  daysUntilDue,
}) => {
  const dueDateStr = new Date(dueDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  await sendMail({
    to,
    subject: `Evaluation reminder: ${employeeFullName} — ${checkpointLabel} due in ${daysUntilDue} day(s)`,
    html: `
      <p>Dear ${managerFirstName},</p>
      <p>This is a reminder that the <strong>${checkpointLabel}</strong> probation evaluation for
      <strong>${employeeFullName}</strong> is due in <strong>${daysUntilDue} day(s)</strong>
      (${dueDateStr}).</p>
      <p>Please log in to your HR Onboard portal to complete the evaluation form before the deadline.</p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Remind an employee that they have required onboarding documents still pending.
 * pendingTypes: [{ name: string }]
 */
const sendPendingDocumentReminderEmail = async ({ to, firstName, pendingTypes }) => {
  const typeRows = pendingTypes
    .map((t) => `<li style="margin:4px 0;">${t.name}</li>`)
    .join('');
  await sendMail({
    to,
    subject: 'Action required: outstanding onboarding documents',
    html: `
      <p>Dear ${firstName},</p>
      <p>The following required onboarding document(s) have not yet been submitted:</p>
      <ul style="margin:12px 0;padding-left:20px;">
        ${typeRows}
      </ul>
      <p>Please log in to your HR Onboard portal and upload these documents at your earliest convenience
      to complete your onboarding.</p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Send a password reset link to the user.
 * rawToken is included in the link — the DB stores only the hashed version.
 * FR-03 | NFR-02
 */
const sendPasswordResetEmail = async ({ to, firstName, rawToken }) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
  await sendMail({
    to,
    subject: 'Reset your HR Onboard password',
    html: `
      <p>Dear ${firstName},</p>
      <p>We received a request to reset the password for your HR Onboard account.</p>
      <p>Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}"
           style="background-color:#1e3a5f;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280;">
        If you did not request a password reset, you can safely ignore this email.
        Your password will not change.
      </p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Welcome email sent to a new employee when HR creates their account.
 * Includes their login email, temporary password, and portal URL.
 * FR-09 / BUG-08
 */
const sendWelcomeEmail = async ({ to, firstName, temporaryPassword }) => {
  const portalUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  await sendMail({
    to,
    subject: 'Welcome to HR Onboard — your account is ready',
    html: `
      <p>Dear ${firstName},</p>
      <p>Your HR Onboard employee account has been created. You can log in immediately using the
      credentials below.</p>
      <table style="border-collapse:collapse;margin:12px 0;font-family:sans-serif;">
        <tr>
          <td style="padding:4px 16px 4px 0;font-weight:bold;">Portal:</td>
          <td><a href="${portalUrl}">${portalUrl}</a></td>
        </tr>
        <tr>
          <td style="padding:4px 16px 4px 0;font-weight:bold;">Email:</td>
          <td>${to}</td>
        </tr>
        <tr>
          <td style="padding:4px 16px 4px 0;font-weight:bold;">Temporary password:</td>
          <td style="font-family:monospace;letter-spacing:0.05em;">${temporaryPassword}</td>
        </tr>
      </table>
      <p style="color:#b45309;font-size:13px;">
        ⚠ Please change your password after your first login using the Settings page.
      </p>
      <p>Your line manager and HR team will guide you through your onboarding tasks and
      required document submissions. If you have any questions, please contact HR directly.</p>
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

/**
 * Notify a line manager that a new employee has been assigned to them and
 * that evaluation checkpoints have been scheduled.
 * FR-11 / FR-09
 */
const sendManagerAssignmentEmail = async ({
  to,
  managerFirstName,
  employeeFullName,
  jobTitle,
  startDate,
  checkpoints,  // [{ label, due_date }]
}) => {
  const startDateStr = startDate
    ? new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  const checkpointRows = checkpoints
    .map(
      (cp) =>
        `<tr>
          <td style="padding:4px 12px 4px 0;">${cp.label}</td>
          <td>${new Date(cp.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
        </tr>`
    )
    .join('');

  await sendMail({
    to,
    subject: `New team member assigned: ${employeeFullName}`,
    html: `
      <p>Dear ${managerFirstName},</p>
      <p>A new employee has been assigned to your team:</p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Name:</td><td>${employeeFullName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Job title:</td><td>${jobTitle}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold;">Start date:</td><td>${startDateStr}</td></tr>
      </table>
      ${checkpoints.length > 0 ? `
      <p>The following probation evaluation checkpoints have been scheduled for this employee:</p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <tr style="font-weight:bold;border-bottom:1px solid #e2e8f0;">
          <td style="padding:4px 12px 4px 0;">Checkpoint</td>
          <td>Due Date</td>
        </tr>
        ${checkpointRows}
      </table>
      <p>You will receive reminder emails 3 days and 1 day before each evaluation deadline.
      Please log in to your HR Onboard portal to complete evaluation forms on time.</p>
      ` : ''}
      <br/>
      <p>Regards,<br/>HR Onboard Team</p>
    `,
  });
};

module.exports = {
  sendMail,
  sendDocumentApprovedEmail,
  sendDocumentRejectedEmail,
  sendTaskAssignedEmail,
  sendOverdueTaskEmail,
  sendEvaluationReminderEmail,
  sendPendingDocumentReminderEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendManagerAssignmentEmail,
};
