// =============================================================================
// src/models/PerformanceNote.js
// Table 16: performance_notes
// FR-12, FR-18 | Objective 2
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
  },
  evaluation_period_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to evaluation_checkpoints — optional link to a checkpoint',
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
