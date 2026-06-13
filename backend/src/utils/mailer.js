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

module.exports = {
  sendMail,
  sendDocumentApprovedEmail,
  sendDocumentRejectedEmail,
};
