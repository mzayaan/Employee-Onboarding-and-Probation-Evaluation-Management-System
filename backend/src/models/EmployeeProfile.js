// =============================================================================
// src/models/EmployeeProfile.js
// Table 3: employee_profiles
// FR-04 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmployeeProfile = sequelize.define('EmployeeProfile', {
  profile_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to users — one profile per employee user',
  },
  department_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to departments',
  },
  manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to users — reporting LINE_MANAGER',
  },
  job_title: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Employment start date',
  },
  probation_end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Must be after start_date — enforced in service layer',
  },
  onboarding_status: {
    type: DataTypes.ENUM('IN_PROGRESS', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'IN_PROGRESS',
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
  tableName: 'employee_profiles',
  timestamps: false,
});

module.exports = EmployeeProfile;
