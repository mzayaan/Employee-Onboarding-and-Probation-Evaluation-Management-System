// =============================================================================
// src/models/TaxDeclaration.js
// Table: tax_declarations
//
// Stores the Mauritius Revenue Authority (MRA) Employee Declaration Form (EDF)
// submission for each employee. Used by the payroll process to determine the
// correct PAYE (Pay As You Earn) deduction band.
//
// Declaration categories A–G correspond to MRA EDF categories:
//   A — Single / married (spouse employed) — base allowance only
//   B — Married, spouse not employed, no children
//   C–F — Married, spouse not employed, 1–4+ children
//   G — Single parent family
//
// FR-NEW-02 | NFR-08 | Objective 1 (extended)
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TaxDeclaration = sequelize.define('TaxDeclaration', {
  declaration_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to employee_profiles — one active declaration per employee',
  },
  declaration_category: {
    type: DataTypes.ENUM('A', 'B', 'C', 'D', 'E', 'F', 'G'),
    allowNull: false,
    comment: 'MRA EDF category — determines the additional personal exemption applied to PAYE',
  },
  num_dependants: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of declared dependent children',
  },
  spouse_employed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether the employee\'s spouse is employed or has independent income',
  },
  declaration_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date the employee signed and submitted this declaration',
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
  tableName: 'tax_declarations',
  timestamps: false,
});

module.exports = TaxDeclaration;
