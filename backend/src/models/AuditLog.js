// =============================================================================
// src/models/AuditLog.js
// Table 19: audit_logs
// FR-18 | NFR-08
// Records must not be updated or deleted in production.
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  log_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — the user who performed the action',
  },
  action_type: {
    type: DataTypes.ENUM(
      'USER_CREATED',
      'USER_DEACTIVATED',
      'LOGIN',
      'LOGOUT',
      'PASSWORD_RESET',
      'EMPLOYEE_CREATED',
      'EMPLOYEE_UPDATED',
      'DOCUMENT_UPLOAD',
      'DOCUMENT_APPROVED',
      'DOCUMENT_REJECTED',
      'TASK_ASSIGNED',
      'TASK_COMPLETED',
      'EVALUATION_SUBMITTED',
      'SELF_ASSESSMENT_SUBMITTED',
      'RECOMMENDATION_GENERATED',
      'PDF_GENERATED',
      'CRITERIA_UPDATED',
      'PROBATION_PERIOD_CREATED',
      'PROBATION_STATUS_CHANGED'
    ),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Human-readable detail of the action',
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: 'Supports IPv4 and IPv6',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'audit_logs',
  timestamps: false,
});

module.exports = AuditLog;
