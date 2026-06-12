// =============================================================================
// src/models/FinalRecommendation.js
// Table 15: final_recommendations
// FR-15 | Objective 3
// Thresholds: >= 75 = CONFIRM, 50–74.99 = EXTEND, < 50 = DISMISS
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FinalRecommendation = sequelize.define('FinalRecommendation', {
  rec_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  period_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to probation_periods — one recommendation per period',
  },
  recommendation_type: {
    type: DataTypes.ENUM('CONFIRM', 'EXTEND', 'DISMISS'),
    allowNull: false,
  },
  cumulative_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Final average score: >= 75 = CONFIRM, 50-74.99 = EXTEND, < 50 = DISMISS',
  },
  generated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  generated_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — HR Admin or system trigger user',
  },
}, {
  tableName: 'final_recommendations',
  timestamps: false,
});

module.exports = FinalRecommendation;
