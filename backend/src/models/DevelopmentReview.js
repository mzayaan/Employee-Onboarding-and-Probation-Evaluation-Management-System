// =============================================================================
// src/models/DevelopmentReview.js
// Table: development_reviews
// FR-12 | Objective 2 — Development Review / Work-Life Balance Assessment
//
// A development review is conducted by the Line Manager or HR at a probation
// checkpoint to assess workload balance, professional growth and wellbeing of
// the employee. It captures structured responses to key balance questions and
// any actions agreed between the manager and the employee.
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DevelopmentReview = sequelize.define('DevelopmentReview', {
  review_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles — the employee under review',
  },
  checkpoint_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to evaluation_checkpoints — optional link to a probation checkpoint',
  },
  reviewed_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — HR Admin or Line Manager conducting the review',
  },

  // ── Work-life balance ─────────────────────────────────────────────────────
  work_life_balance_rating: {
    type: DataTypes.ENUM('Well Balanced', 'Mostly Balanced', 'Somewhat Unbalanced', 'Very Unbalanced'),
    allowNull: true,
    comment: 'Is your work/personal life balance? — manager assessment',
  },
  workload_assessment: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Overall workload assessment — is the employee overloaded, underloaded, or appropriate?',
  },

  // ── Professional balance ──────────────────────────────────────────────────
  professional_balance_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Professional balance — career progression, role clarity, job satisfaction observations',
  },
  professional_development_goals: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Agreed professional development goals for the next review period',
  },

  // ── Actions to balance personal life vs work ──────────────────────────────
  actions_to_balance: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Actions agreed to improve work-life balance (e.g. flexible hours, reduced overtime)',
  },
  support_offered: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Support or resources offered to the employee (e.g. EAP, mentoring, training)',
  },

  // ── Follow-up ─────────────────────────────────────────────────────────────
  next_review_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Agreed date for the next development review',
  },
  employee_acknowledgement: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether the employee has acknowledged this review record',
  },
  employee_acknowledgement_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: 'Date the employee acknowledged this review',
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
  tableName: 'development_reviews',
  timestamps: false,
});

module.exports = DevelopmentReview;
