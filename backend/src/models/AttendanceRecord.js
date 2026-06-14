// =============================================================================
// src/models/AttendanceRecord.js
// Table: attendance_records
// Records attendance-related information within an employee's probation period.
// FR-12 | Objective 2
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AttendanceRecord = sequelize.define('AttendanceRecord', {
  record_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  period_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to probation_periods',
  },
  record_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date of the attendance entry',
  },
  status: {
    type: DataTypes.ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'),
    allowNull: false,
    defaultValue: 'PRESENT',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional context — reason for absence, lateness, etc.',
  },
  recorded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users (the manager or HR who recorded this)',
  },
}, {
  tableName: 'attendance_records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = AttendanceRecord;
