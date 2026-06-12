// =============================================================================
// src/config/database.js
// Sequelize connection to MySQL
// FR-01 to FR-18 | All objectives
// =============================================================================

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      underscored: true,       // snake_case column names in DB
      freezeTableName: true,   // prevent Sequelize from pluralising table names
      timestamps: false,       // each model declares its own timestamp fields
    },
    timezone: '+04:00',        // Mauritius Standard Time (UTC+4)
  }
);

module.exports = sequelize;
