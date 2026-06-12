// =============================================================================
// src/models/User.js
// Table 2: users
// FR-01, FR-02, FR-03 | NFR-02, NFR-03
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'bcrypt-hashed password — never store plain text',
  },
  role: {
    type: DataTypes.ENUM('HR_ADMIN', 'LINE_MANAGER', 'NEW_EMPLOYEE', 'SYSTEM_ADMIN'),
    allowNull: false,
  },
  first_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  last_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Inactive users are denied login access',
  },
  reset_token: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Time-limited password-reset token (FR-03)',
  },
  reset_token_expiry: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_login_at: {
    type: DataTypes.DATE,
    allowNull: true,
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
  tableName: 'users',
  timestamps: false,
});

module.exports = User;
