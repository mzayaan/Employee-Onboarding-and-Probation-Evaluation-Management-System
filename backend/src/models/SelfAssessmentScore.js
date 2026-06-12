// =============================================================================
// src/models/SelfAssessmentScore.js
// Table 14: self_assessment_scores
// FR-13, FR-14 | Objective 2
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SelfAssessmentScore = sequelize.define('SelfAssessmentScore', {
  score_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  assessment_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to self_assessments',
  },
  criterion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to evaluation_criteria',
  },
  raw_score: {
    type: DataTypes.TINYINT,
    allowNull: false,
    comment: 'Employee rating 1–5',
    validate: { min: 1, max: 5 },
  },
  weighted_contribution: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Calculated as (raw_score / 5.0) * weight_percent',
  },
}, {
  tableName: 'self_assessment_scores',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['assessment_id', 'criterion_id'],
      name: 'uq_sas_assessment_criterion',
    },
  ],
});

module.exports = SelfAssessmentScore;
