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
      'USER_ACTIVATED',
      'USER_DEACTIVATED',
      'LOGIN',
      'LOGIN_FAILED',
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
      'RECOMMENDATION_GENERATED',       // kept for backwards-compatibility
      // Probation approval workflow (Block 5 — 3-stage Director approval)
      'RECOMMENDATION_SUBMITTED',       // manager submits → PENDING_HR_REVIEW
      'RECOMMENDATION_ENDORSED',        // HR endorses → PENDING_DIRECTOR
      'RECOMMENDATION_RETURNED_BY_HR',  // HR returns → RETURNED_TO_MANAGER
      'RECOMMENDATION_RESUBMITTED',     // manager resubmits → PENDING_HR_REVIEW
      'RECOMMENDATION_APPROVED',        // Director approves → APPROVED; period updated
      'RECOMMENDATION_RETURNED_BY_DIRECTOR', // Director returns → RETURNED_TO_MANAGER
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
      // Department (Block 3 — lecturer requirement: one manager per department)
      'CREATE_DEPARTMENT',
      'UPDATE_DEPARTMENT',
      'DEPARTMENT_MANAGER_ASSIGNED',    // a manager was assigned to a department
      'DEPARTMENT_MANAGER_REMOVED',     // a manager was removed from a department
      // Development reviews (Block 7)
      'DEVELOPMENT_REVIEW_CREATED',
      'DEVELOPMENT_REVIEW_UPDATED',
      'DEVELOPMENT_REVIEW_ACKNOWLEDGED',
      'DEVELOPMENT_REVIEW_DELETED',
      // Tax declaration
      'SUBMIT_TAX_DECLARATION',
      // Contract
      'SIGN_CONTRACT',
      'CREATE_CONTRACT',
      // HRDC training
      'ADD_HRDC_TRAINING_LOG',
      'DELETE_HRDC_TRAINING_LOG',
      'EXPORT_HRDC_G1',
      // System config
      'CREATE_SYSTEM_CONFIG',
      'UPDATE_SYSTEM_CONFIG',
      // Profile image (two controllers use different strings — both kept)
      'PROFILE_IMAGE_UPDATED',
      'UPDATE_PROFILE_IMAGE',
      // Employee self-update
      'EMPLOYEE_SELF_UPDATE'
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
