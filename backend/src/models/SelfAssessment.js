// =============================================================================
// src/models/SelfAssessment.js
// Table 13: self_assessments
// FR-13 | Objective 2
//
// Two-way probation fields (v2): captures structured onboarding feedback from
// the employee's perspective alongside the star-rating criteria scores.
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

  // ── Two-way probation feedback fields ─────────────────────────────────────
  onboarding_progress_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Employee response: "How is your onboarding progressing?"',
  },
  understands_responsibilities: {
    type: DataTypes.ENUM('Yes', 'Partially', 'No'),
    allowNull: true,
    comment: 'Do you understand your responsibilities?',
  },
  received_sufficient_training: {
    type: DataTypes.ENUM('Yes', 'Partially', 'No'),
    allowNull: true,
    comment: 'Have you received sufficient training?',
  },
  has_required_system_access: {
    type: DataTypes.ENUM('Yes', 'Partially', 'No'),
    allowNull: true,
    comment: 'Do you have the required system access?',
  },
  areas_needing_support: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Areas where additional support is required',
  },
  training_support_requested: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Specific training or support requested by the employee',
  },
  employee_comments: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'General comments from the employee',
  },
  employee_acknowledgement_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Date the employee acknowledged and signed the self-assessment',
  },
}, {
  tableName: 'self_assessments',
  timestamps: false,
});

module.exports = SelfAssessment;
