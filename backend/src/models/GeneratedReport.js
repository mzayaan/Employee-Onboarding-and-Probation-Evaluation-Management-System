// =============================================================================
// src/models/GeneratedReport.js
// Table 17: generated_reports
// FR-16, FR-18 | Objective 3
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GeneratedReport = sequelize.define('GeneratedReport', {
  report_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  period_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to probation_periods — which period this report covers',
  },
  generated_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — HR Admin or Line Manager who triggered generation',
  },
  cloudinary_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Stored PDF URL if the report is persisted to Cloudinary',
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'File size in bytes if persisted',
  },
  generated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'generated_reports',
  timestamps: false,
});

module.exports = GeneratedReport;
