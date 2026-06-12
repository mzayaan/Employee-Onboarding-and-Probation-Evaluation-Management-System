// =============================================================================
// src/models/EvaluationCriterion.js
// Table 8: evaluation_criteria
// FR-10 | Objective 2
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EvaluationCriterion = sequelize.define('EvaluationCriterion', {
  criterion_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Guidance shown to evaluators in the evaluation form',
  },
  weight_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Percentage weight — all active criteria must sum to 100.00',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Inactive criteria are excluded from new evaluations',
  },
  display_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — System Admin who created criterion',
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
  tableName: 'evaluation_criteria',
  timestamps: false,
});

module.exports = EvaluationCriterion;
