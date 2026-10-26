// =============================================================================
// src/models/EmployeeProfile.js
// Table 3: employee_profiles
// FR-04 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmployeeProfile = sequelize.define('EmployeeProfile', {
  profile_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to users — one profile per employee user',
  },
  department_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to departments',
  },
  manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to users — reporting LINE_MANAGER',
  },
  job_title: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Employment start date',
  },
  probation_end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Must be after start_date — enforced in service layer',
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female'),
    allowNull: false,
    comment: 'Required for Statistics Mauritius gender-disaggregated headcount reporting',
  },
  nationality: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Employee nationality — relevant for work permit checks in Mauritius context',
  },
  salary_monthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Monthly salary in MUR — used to determine Vacation Leave eligibility per WRA 2019 s.47 (threshold: MUR 50,000/month)',
  },

  // ── Mauritius Identity & Tax Fields ──────────────────────────────────────
  nic_number: {
    type: DataTypes.STRING(14),
    allowNull: true,
    unique: true,
    comment: 'Mauritian National Identity Card number — 14 characters (letter + 13 digits). Validated at route layer by validateNIC middleware.',
  },
  tax_account_number: {
    type: DataTypes.STRING(10),
    allowNull: true,
    unique: true,
    comment: 'MRA Tax Account Number (TAN) — individual tax reporting reference issued by the Mauritius Revenue Authority.',
  },

  // ── Banking Details for Payroll Routing ──────────────────────────────────
  bank_name: {
    type: DataTypes.ENUM('MCB', 'SBM', 'ABSA', 'MAUBANK', 'AfrAsia', 'BCP', 'HSBC'),
    allowNull: true,
    comment: 'Mauritian bank for local ACH/clearing house salary routing.',
  },
  bank_account_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Employee bank account number — stored for payroll purposes only.',
  },

  employment_status: {
    type: DataTypes.ENUM('PROBATION', 'PERMANENT', 'DISMISSED', 'EXTENDED'),
    allowNull: false,
    defaultValue: 'PROBATION',
    comment: 'Updated automatically when Director approves probation recommendation',
  },
  onboarding_status: {
    type: DataTypes.ENUM('IN_PROGRESS', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'IN_PROGRESS',
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
  tableName: 'employee_profiles',
  timestamps: false,
});

module.exports = EmployeeProfile;
