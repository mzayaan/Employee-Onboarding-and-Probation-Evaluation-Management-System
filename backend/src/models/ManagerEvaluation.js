// =============================================================================
// src/models/ManagerEvaluation.js
// Table 11: manager_evaluations
// FR-11, FR-12, FR-14 | Objective 2
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ManagerEvaluation = sequelize.define('ManagerEvaluation', {
  eval_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  checkpoint_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to evaluation_checkpoints — one evaluation per checkpoint',
  },
  evaluated_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — Line Manager who submitted',
  },
  attendance_days_present: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  attendance_days_absent: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  late_arrivals: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  weighted_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Calculated weighted score for this checkpoint (0.00–100.00)',
  },
  submitted_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'manager_evaluations',
  timestamps: false,
});

module.exports = ManagerEvaluation;
