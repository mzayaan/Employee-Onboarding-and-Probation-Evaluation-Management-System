// =============================================================================
// src/models/Contract.js
// Table: contracts
// Stores employment contract metadata to enforce WRA 2019 probation rules.
//
// Key business rule (WRA 2019 s.13):
//   If probation_clause_included = false, employment_status must be set
//   to PERMANENT immediately and evaluation checkpoints must be blocked.
//   This is enforced in the employee creation service / controller layer.
//
// FR-04 (extended) | NFR-08 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Contract = sequelize.define('Contract', {
  contract_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to employee_profiles — one contract record per employee',
  },
  contract_reference: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'Internal contract reference number, e.g. CORP/2026/042',
  },
  contract_type: {
    type: DataTypes.ENUM('INDETERMINATE', 'PART_TIME', 'FIXED_TERM'),
    allowNull: false,
    comment: 'INDETERMINATE = permanent open-ended; FIXED_TERM = specified end date; PART_TIME = part-time arrangement',
  },
  probation_duration_months: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    comment: 'Configured probation length in months. validateProbationBoundary middleware enforces max 6 months (WRA 2019).',
  },
  probation_clause_included: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'WRA 2019 s.13: if false, employee is PERMANENT from day one — service layer must set employment_status = PERMANENT and block checkpoint generation.',
  },
  basic_salary_mur: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Gross basic monthly salary in MUR as stated in the contract.',
  },
  notice_period_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 14,
    comment: 'Contractual notice period in calendar days.',
  },
  signed_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Date the employee signed the contract — null until signed.',
  },
  cloudinary_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Cloudinary URL of the signed contract PDF, if uploaded.',
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
  tableName: 'contracts',
  timestamps: false,
});

module.exports = Contract;
