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
      // Auth
      'USER_CREATED',
      'USER_DEACTIVATED',
      'LOGIN',
      'LOGOUT',
      'PASSWORD_RESET',
      'PASSWORD_RESET_REQUESTED',
      'PASSWORD_RESET_COMPLETED',
      'PASSWORD_CHANGED',
      // Employee
      'EMPLOYEE_CREATED',
      'EMPLOYEE_UPDATED',
      // Documents
      'DOCUMENT_UPLOAD',
      'DOCUMENT_APPROVED',
      'DOCUMENT_REJECTED',
      // Tasks
      'TASK_ASSIGNED',
      'TASK_STATUS_UPDATED',
      'TASK_COMPLETED',
      'TASK_DELETED',
      // Evaluation
      'EVALUATION_SUBMITTED',
      'SELF_ASSESSMENT_SUBMITTED',
      'RECOMMENDATION_GENERATED',
      // Reports
      'PDF_GENERATED',
      'REPORT_GENERATED',
      // Criteria
      'CRITERIA_UPDATED',
      'CRITERIA_CREATED',
      'CRITERIA_DEACTIVATED',
      // Probation
      'PROBATION_PERIOD_CREATED',
      'PROBATION_STATUS_CHANGED',
      // Attendance
      'ATTENDANCE_RECORDED',
      // Department
      'CREATE_DEPARTMENT',
      'UPDATE_DEPARTMENT'
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
