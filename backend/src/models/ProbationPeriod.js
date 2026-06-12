// =============================================================================
// src/models/ProbationPeriod.js
// Table 9: probation_periods
// FR-11, FR-14, FR-15 | Objective 2
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProbationPeriod = sequelize.define('ProbationPeriod', {
  period_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles',
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'COMPLETED', 'EXTENDED'),
    allowNull: false,
    defaultValue: 'ACTIVE',
  },
  final_recommendation: {
    type: DataTypes.ENUM('CONFIRM', 'EXTEND', 'DISMISS'),
    allowNull: true,
    comment: 'Set after the last evaluation checkpoint is completed',
  },
  cumulative_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
    comment: 'Average weighted score across all completed checkpoints',
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
  tableName: 'probation_periods',
  timestamps: false,
});

module.exports = ProbationPeriod;
