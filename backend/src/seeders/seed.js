// =============================================================================
// src/seeders/seed.js
// Development seed script — test users only.
// Departments are already seeded directly in the database.
// Run with:  node src/seeders/seed.js
//
// NEVER run this against a production database.
// =============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const bcrypt    = require('bcrypt')
const sequelize = require('../config/database')
const { User }  = require('../models')

const SEED_USERS = [
  {
    email:      'hr@onboard.dev',
    password:   'Password123!',
    role:       'HR_ADMIN',
    first_name: 'Sarah',
    last_name:  'Mitchell',
    is_active:  true,
  },
  {
    email:      'manager@onboard.dev',
    password:   'Password123!',
    role:       'LINE_MANAGER',
    first_name: 'James',
    last_name:  'Okonkwo',
    is_active:  true,
  },
  {
    email:      'employee@onboard.dev',
    password:   'Password123!',
    role:       'NEW_EMPLOYEE',
    first_name: 'Priya',
    last_name:  'Ramnarain',
    is_active:  true,
  },
  {
    email:      'admin@onboard.dev',
    password:   'Password123!',
    role:       'SYSTEM_ADMIN',
    first_name: 'Dev',
    last_name:  'Admin',
    is_active:  true,
  },
]

async function seed() {
  try {
    await sequelize.authenticate()
    console.log('✅  Database connected')

    let created = 0
    let skipped = 0

    for (const u of SEED_USERS) {
      const existing = await User.findOne({ where: { email: u.email } })
      if (existing) {
        console.log(`⏭   Skipped  ${u.email}  (already exists)`)
        skipped++
        continue
      }
      const password_hash = await bcrypt.hash(u.password, 12)
      await User.create({ ...u, password_hash })
      console.log(`✅  Created  ${u.role.padEnd(14)}  ${u.email}`)
      created++
    }

    console.log(`\n── Seed complete: ${created} created, ${skipped} skipped ──`)
    console.log('\nTest credentials (all use Password123!):')
    console.log('  HR Admin     →  hr@onboard.dev')
    console.log('  Line Manager →  manager@onboard.dev')
    console.log('  New Employee →  employee@onboard.dev')
    console.log('  System Admin →  admin@onboard.dev')

  } catch (err) {
    console.error('❌  Seed failed:', err.message)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

seed()
