// =============================================================================
// src/models/SystemConfig.js
// Table: system_configs
//
// Stores globally active administrative parameters — initially the statutory
// minimum salary baseline. Each legislative change creates a NEW row with an
// effective_date; historical rows are never deleted, supporting audit trails.
//
// Usage: SELECT the row where effective_date <= applicable_date ORDER BY
//        effective_date DESC LIMIT 1 to get the rate active on a given date.
//
// Initial seed value: MUR 17,745.00 / month (reference general baseline 2026).
// IMPORTANT: Verify current statutory rates against official Remuneration Orders
//            and the National Remuneration Board before enabling strict
//            enforcement in production.
//
// FR-NEW-02 | NFR-08 | Spec s.1.3, s.2.2 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

const SystemConfig = sequelize.define('SystemConfig', {
  config_id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  min_salary_mur: {
    type:        DataTypes.DECIMAL(10, 2),
    allowNull:   false,
    comment:
      'Statutory minimum monthly salary in MUR. ' +
      'Reference general baseline: Rs 17,745.00 for 2026. ' +
      'Verify against National Remuneration Board orders before production use. ' +
      'Varies by employee category, sector, and work arrangement.',
  },
  effective_date: {
    type:      DataTypes.DATEONLY,
    allowNull: false,
    comment:
      'Date from which this minimum salary figure became legally effective. ' +
      'Create a new row for each legislative update; never modify or delete historical rows.',
  },
  updated_by: {
    type:      DataTypes.INTEGER,
    allowNull: true,
    comment:   'FK to users.user_id — the SYSTEM_ADMIN who created this configuration row.',
  },
  created_at: {
    type:         DataTypes.DATE,
    allowNull:    false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type:      DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName:  'system_configs',
  timestamps: false,
});

module.exports = SystemConfig;
