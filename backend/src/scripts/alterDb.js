// =============================================================================
// src/scripts/alterDb.js
// One-time DB schema migration: adds columns / tables introduced in Block 1
// that may not yet exist in the running MySQL database.
//
// Run ONCE from the backend folder:
//   node src/scripts/alterDb.js
//
// Safe to re-run — ALTER TABLE ... ADD COLUMN IF NOT EXISTS guards against
// duplicate-column errors. Sequelize sync({ alter: true }) is also safe on
// an existing database; it adds missing columns but never drops anything.
// =============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const sequelize = require('../config/database')
const { sequelize: seqInstance } = require('../models')

async function alterDb() {
  try {
    await seqInstance.authenticate()
    console.log('✅  Connected to MySQL')

    // Sync all models with alter:true — adds missing columns, updates ENUMs,
    // creates missing tables (e.g. LeaveBalance). Never drops existing data.
    await seqInstance.sync({ alter: true })
    console.log('✅  Schema synchronised — all missing columns and tables added')

    await seqInstance.close()
    console.log('✅  Done. You can now restart the backend server.')
    process.exit(0)
  } catch (err) {
    console.error('❌  Error during schema sync:', err.message)
    console.error(err)
    process.exit(1)
  }
}

void alterDb()
