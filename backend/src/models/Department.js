// =============================================================================
// src/models/Department.js
// Table 1: departments
// FR-04, FR-19 | Objective 1
// Updated: added manager_id (UNIQUE) — each department has exactly one manager
// per lecturer requirement and Mauritius organisational practice
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Department = sequelize.define('Department', {
  department_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
    comment: 'FK to users (LINE_MANAGER) — UNIQUE enforces one manager per department',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'departments',
  timestamps: false,
});

module.exports = Department;
