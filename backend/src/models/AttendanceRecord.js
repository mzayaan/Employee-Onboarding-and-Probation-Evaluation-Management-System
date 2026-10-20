// =============================================================================
// src/models/AttendanceRecord.js
// Table: attendance_records
// Records attendance-related information within an employee's probation period.
// FR-12, FR-21 | Objective 2
// Updated: expanded status ENUM to include WRA 2019 leave types (ss.45-47)
//          and added medical_certificate_provided flag per WRA 2019 s.46(3)
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
    type: DataTypes.ENUM(
      'PRESENT',
      'ABSENT',
      'LATE',
      'HALF_DAY',
      'SICK_LEAVE',       // WRA 2019 s.46 — 15 days/year, accumulates to 90 days max
      'ANNUAL_LEAVE',     // WRA 2019 s.45 — 22 working days/year (universal)
      'VACATION_LEAVE',   // WRA 2019 s.47 — 30 days per 5-year period (salary ≤ MUR 50,000/month)
      'MATERNITY_LEAVE',  // WRA 2019 s.48 — 14 weeks paid
      'PATERNITY_LEAVE',  // WRA 2019 s.49 — 5 days paid
      'SPECIAL_LEAVE',    // Discretionary — bereavement, civic duty, etc.
      'PUBLIC_HOLIDAY'    // Public Holidays Act — Mauritius statutory holidays
    ),
    allowNull: false,
    defaultValue: 'PRESENT',
  },
  medical_certificate_provided: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'WRA 2019 s.46(3): medical certificate required for sick leave of 3 or more consecutive days',
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
