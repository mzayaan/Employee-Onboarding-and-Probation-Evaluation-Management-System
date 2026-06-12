// =============================================================================
// src/models/EvaluationCheckpoint.js
// Table 10: evaluation_checkpoints
// FR-11, FR-16 | Objective 2
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EvaluationCheckpoint = sequelize.define('EvaluationCheckpoint', {
  checkpoint_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  period_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to probation_periods',
  },
  checkpoint_label: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'e.g., "30-Day Review", "60-Day Review", "90-Day Review"',
  },
  day_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '30, 60, or 90 — days from probation start_date',
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'OVERDUE'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  triggered_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when system triggered this checkpoint',
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when manager evaluation was submitted',
  },
}, {
  tableName: 'evaluation_checkpoints',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['period_id', 'day_number'],
      name: 'uq_checkpoint_period_day',
    },
  ],
});

module.exports = EvaluationCheckpoint;
