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

module.exports = {
  sendMail,
  sendDocumentApprovedEmail,
  sendDocumentRejectedEmail,
  sendTaskAssignedEmail,
  sendOverdueTaskEmail,
  sendEvaluationReminderEmail,
};
