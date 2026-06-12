// =============================================================================
// src/models/SelfAssessment.js
// Table 13: self_assessments
// FR-13 | Objective 2
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SelfAssessment = sequelize.define('SelfAssessment', {
  assessment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  checkpoint_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to evaluation_checkpoints — one self-assessment per checkpoint',
  },
  employee_profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles — the self-assessing employee',
  },
  self_reflection_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  self_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Calculated weighted self-assessment score (0.00–100.00)',
  },
  submitted_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'self_assessments',
  timestamps: false,
});

module.exports = SelfAssessment;
