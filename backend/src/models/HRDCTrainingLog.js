// =============================================================================
// src/models/HRDCTrainingLog.js
// Table: hrdc_training_logs
// Tracks employee training activity for HRDC levy refund claim processing.
//
// The Human Resource Development Council (HRDC) administers the Training
// Levy under the Human Resource Development Act. Employers contributing
// to the levy may claim refunds for approved training programmes via the
// HRDC G1 form. This table captures the data required for those claims.
//
// FR-NEW-01 | Objective 1 (extended)
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HRDCTrainingLog = sequelize.define('HRDCTrainingLog', {
  training_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles — the employee who attended the training',
  },
  course_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Full name of the training course or programme',
  },
  training_provider: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'Internal',
    comment: 'Name of training provider — "Internal" for in-house delivery',
  },
  hrdc_approved_course_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'MQA/HRDC course approval code — required for external HRDC refund claims',
  },
  training_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Total cost of the training in MUR — used in HRDC G1 claim calculations',
  },
  duration_hours: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Total training duration in hours',
  },
  completed_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date the employee completed the training',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'hrdc_training_logs',
  timestamps: false,
});

module.exports = HRDCTrainingLog;
