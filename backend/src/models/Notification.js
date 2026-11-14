// =============================================================================
// src/models/Notification.js
// Table 18: notifications
// FR-09 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  notification_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — notification recipient',
  },
  type: {
    type: DataTypes.ENUM(
      // Onboarding — document lifecycle
      'DOCUMENT_PENDING',
      'DOCUMENT_APPROVED',
      'DOCUMENT_REJECTED',
      // Onboarding — tasks
      'TASK_ASSIGNED',
      'TASK_OVERDUE',
      // Evaluation — checkpoint reminders
      'EVAL_DUE',
      'EVAL_OVERDUE',
      // Account
      'ACCOUNT_CREATED',
      // Reporting
      'PDF_GENERATED',
      // Probation period
      'PROBATION_COMPLETE',
      // Probation approval workflow (Block 5 — 3-stage Director approval)
      'RECOMMENDATION_PENDING',    // notified to HR when manager submits
      'RECOMMENDATION_RETURNED',   // notified to manager when HR or Director returns
      'RECOMMENDATION_APPROVED',   // notified to HR + manager when Director approves
      // Probation outcome (employee notification on Director final decision)
      'PROBATION_OUTCOME',
      // Development reviews
      'DEVELOPMENT_REVIEW_CREATED',
      'DEVELOPMENT_REVIEW_ACKNOWLEDGED',
      // Additional workflow events (G47-FIX)
      'EMPLOYEE_ASSIGNED',          // manager notified when an employee is assigned to them
      'SELF_ASSESSMENT_SUBMITTED',  // HR/manager notified when employee submits self-assessment
      'PERFORMANCE_NOTE_ADDED',     // employee notified when a performance note is added
      'PERFORMANCE_NOTE_RESPONDED'  // manager notified when employee responds to a note
    ),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  related_entity_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'e.g., "document", "task", "checkpoint"',
  },
  related_entity_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Primary key of the related record',
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'notifications',
  timestamps: false,
});

module.exports = Notification;
