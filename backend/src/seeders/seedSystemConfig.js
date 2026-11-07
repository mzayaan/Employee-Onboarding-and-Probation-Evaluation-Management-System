// =============================================================================
// src/seeders/seedSystemConfig.js
// Seeds the initial system_configs row for statutory minimum salary.
//
// Initial seed value: MUR 17,745.00 / month (reference general baseline 2026).
//
// IMPORTANT: This is a reference figure for development and testing.
// Before production deployment, verify the current rate against:
//   - The National Remuneration Board (NRB) orders
//   - The applicable Remuneration Regulations for the employee category
//   - The official gazette effective dates
// The rate varies by employee category, sector, and work arrangement.
//
// Run with:  node src/seeders/seedSystemConfig.js
// NEVER run against a production database without verification.
//
// Spec s.2.2 | FR-NEW-02 | NFR-08
// =============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const sequelize    = require('../config/database')
const { SystemConfig } = require('../models')

async function seedSystemConfig() {
  try {
    await sequelize.authenticate()
    console.log('✅  Database connected')

    // Check if any config already exists
    const existing = await SystemConfig.findOne({
      where: { effective_date: '2026-01-01' },
    })

    if (existing) {
      console.log('⏭   Skipped: system_configs row for 2026-01-01 already exists.')
      console.log(`     Current value: MUR ${existing.min_salary_mur}`)
    } else {
      await SystemConfig.create({
        min_salary_mur:  17745.00,
        effective_date:  '2026-01-01',
        updated_by:      null,  // Initial seed — no actor
        created_at:      new Date(),
        updated_at:      null,
      })
      console.log('✅  Created system_configs: MUR 17,745.00 effective 2026-01-01')
      console.log('')
      console.log('  ⚠  IMPORTANT: This is a reference general baseline for 2026.')
      console.log('     Verify against National Remuneration Board orders')
      console.log('     and applicable Remuneration Regulations before production use.')
    }

  } catch (err) {
    console.error('❌  Seed failed:', err.message)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

seedSystemConfig()
