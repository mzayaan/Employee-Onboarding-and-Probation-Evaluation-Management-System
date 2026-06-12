// =============================================================================
// src/models/TaskAssignment.js
// Table 7: task_assignments
// FR-07, FR-08, FR-18 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TaskAssignment = sequelize.define('TaskAssignment', {
  assignment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles — task recipient',
  },
  task_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to onboarding_tasks — task template',
  },
  assigned_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — HR Admin or Line Manager',
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('TODO', 'IN_PROGRESS', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'TODO',
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Populated when status transitions to COMPLETED',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'task_assignments',
  timestamps: false,
});

module.exports = TaskAssignment;
