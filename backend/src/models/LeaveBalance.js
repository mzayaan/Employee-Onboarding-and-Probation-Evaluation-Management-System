// =============================================================================
// src/models/LeaveBalance.js
// Table: leave_balances
// FR-21 | Mauritius legal context — WRA 2019 leave entitlements
//
// Tracks statutory leave entitlements per employee per calendar year:
//   Annual Leave    — WRA 2019 s.45: 22 working days/year (universal)
//   Sick Leave      — WRA 2019 s.46: 15 days/year, accumulates to 90 days max
//   Vacation Leave  — WRA 2019 s.47: 30 days per 5-year period,
//                     only for employees with monthly salary ≤ MUR 50,000
//   Maternity Leave — WRA 2019 s.48: 14 weeks fully paid = 70 working days
//   Paternity Leave — WRA 2019 s.49: 5 continuous working days paid
//
// One record per employee per year. Created automatically when a new employee
// profile is created (service layer).
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LeaveBalance = sequelize.define('LeaveBalance', {
  balance_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles',
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Calendar year this balance applies to (e.g. 2025)',
  },

  // ── Annual Leave (WRA 2019 s.45) ──────────────────────────────────────────
  annual_leave_entitled: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: false,
    defaultValue: 22.0,
    comment: 'WRA 2019 s.45: 22 working days per year (pro-rated in first year of employment)',
  },
  annual_leave_used: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: false,
    defaultValue: 0.0,
    comment: 'Days of annual leave taken so far this year',
  },

  // ── Sick Leave (WRA 2019 s.46) ────────────────────────────────────────────
  sick_leave_entitled: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: false,
    defaultValue: 15.0,
    comment: 'WRA 2019 s.46: 15 days per year, accumulates up to 90 days maximum',
  },
  sick_leave_used: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: false,
    defaultValue: 0.0,
    comment: 'Days of sick leave taken so far this year',
  },
  sick_leave_accumulated: {
    type: DataTypes.DECIMAL(5, 1),
    allowNull: false,
    defaultValue: 0.0,
    comment: 'Total accumulated sick leave balance across years (WRA 2019 s.46: capped at 90 days)',
  },

  // ── Vacation Leave (WRA 2019 s.47) ───────────────────────────────────────
  vacation_leave_eligible: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'WRA 2019 s.47: eligible only if monthly salary ≤ MUR 50,000 — derived from employee_profiles.salary_monthly',
  },
  vacation_leave_entitled: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: false,
    defaultValue: 0.0,
    comment: 'WRA 2019 s.47: 30 days per 5-year period (6 days per year when eligible)',
  },
  vacation_leave_used: {
    type: DataTypes.DECIMAL(4, 1),
    allowNull: false,
    defaultValue: 0.0,
    comment: 'Days of vacation leave taken so far this year',
  },

  // ── Maternity Leave (WRA 2019 s.48) ──────────────────────────────────────
  maternity_leave_entitled: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 70,
    comment: 'WRA 2019 s.48: 14 weeks fully paid maternity leave = 70 working days.',
  },

  // ── Paternity Leave (WRA 2019 s.49) ──────────────────────────────────────
  paternity_leave_entitled: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    comment: 'WRA 2019 s.49: 5 continuous working days paid paternity leave.',
  },

  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'leave_balances',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['profile_id', 'year'],
      name: 'uq_leave_balance_profile_year',
    },
  ],
});

module.exports = LeaveBalance;
