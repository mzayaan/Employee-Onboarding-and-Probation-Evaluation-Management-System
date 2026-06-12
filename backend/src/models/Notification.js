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
      'DOCUMENT_PENDING',
      'DOCUMENT_APPROVED',
      'DOCUMENT_REJECTED',
      'TASK_ASSIGNED',
      'TASK_OVERDUE',
      'EVAL_DUE',
      'EVAL_OVERDUE',
      'ACCOUNT_CREATED',
      'PDF_GENERATED',
      'PROBATION_COMPLETE'
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
