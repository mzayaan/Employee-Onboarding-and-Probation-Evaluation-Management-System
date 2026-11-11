// =============================================================================
// src/models/PerformanceNote.js
// Table 16: performance_notes
// FR-12, FR-18 | Objective 2
//
// KPI Review fields (v2): structured appraisal categories for work-related,
// soft skills and behavioural KPIs, plus an employee feedback channel.
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PerformanceNote = sequelize.define('PerformanceNote', {
  note_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles — employee the note is about',
  },
  recorded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — Line Manager or HR Admin',
  },
  note_text: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Main performance note / observation text',
  },
  evaluation_period_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to evaluation_checkpoints — optional link to a checkpoint',
  },

  // ── KPI Review fields ─────────────────────────────────────────────────────
  note_category: {
    type: DataTypes.ENUM(
      'GENERAL',
      'WORK_RELATED_KPI',
      'SOFT_SKILLS_KPI',
      'BEHAVIORAL_KPI',
      'EMPLOYEE_FEEDBACK'
    ),
    allowNull: false,
    defaultValue: 'GENERAL',
    comment: 'Category of this note — drives the KPI review panel',
  },
  kpi_target: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'The KPI target or expected standard for this period',
  },
  kpi_achievement: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'What was actually achieved against the KPI target',
  },
  kpi_rating: {
    type: DataTypes.TINYINT,
    allowNull: true,
    comment: 'Manager rating 1–5 for this KPI category',
    validate: { min: 1, max: 5 },
  },
  employee_response: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Employee\'s own response or comment on this performance note (two-way feedback)',
  },

  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'performance_notes',
  timestamps: false,
});

module.exports = PerformanceNote;
