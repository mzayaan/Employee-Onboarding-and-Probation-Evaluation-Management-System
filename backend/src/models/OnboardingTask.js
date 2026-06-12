// =============================================================================
// src/models/OnboardingTask.js
// Table 6: onboarding_tasks
// FR-07, FR-08 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OnboardingTask = sequelize.define('OnboardingTask', {
  task_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  default_due_days: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Default number of days from employee start_date',
  },
  priority: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH'),
    allowNull: false,
    defaultValue: 'MEDIUM',
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — HR Admin or Line Manager who created this task template',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'onboarding_tasks',
  timestamps: false,
});

module.exports = OnboardingTask;
