// =============================================================================
// src/models/EvaluationScore.js
// Table 12: evaluation_scores
// FR-14 | Objective 2
// Formula: weighted_contribution = (raw_score / 5.0) * weight_percent
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EvaluationScore = sequelize.define('EvaluationScore', {
  score_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  eval_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to manager_evaluations',
  },
  criterion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to evaluation_criteria',
  },
  raw_score: {
    type: DataTypes.TINYINT,
    allowNull: false,
    comment: 'Manager rating 1–5',
    validate: { min: 1, max: 5 },
  },
  weighted_contribution: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Calculated as (raw_score / 5.0) * weight_percent',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'evaluation_scores',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['eval_id', 'criterion_id'],
      name: 'uq_es_eval_criterion',
    },
  ],
});

module.exports = EvaluationScore;
