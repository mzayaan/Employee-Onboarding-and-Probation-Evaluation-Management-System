// =============================================================================
// src/seeders/seedDocumentTypes.js
// Seeds document_types table with the four required onboarding document types.
// Run with:  node src/seeders/seedDocumentTypes.js
// Idempotent — skips rows that already exist.
// =============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const sequelize      = require('../config/database');
const { DocumentType } = require('../models');

const DOCUMENT_TYPES = [
  {
    name:          'National ID',
    description:   'Government-issued national identity card or passport.',
    is_required:   true,
    display_order: 1,
  },
  {
    name:          'Employment Contract',
    description:   'Signed employment contract for the current position.',
    is_required:   true,
    display_order: 2,
  },
  {
    name:          'Bank Details Form',
    description:   'Bank account information form for payroll setup.',
    is_required:   true,
    display_order: 3,
  },
  {
    name:          'Educational Certificate',
    description:   'Highest level educational qualification certificate.',
    is_required:   false,
    display_order: 4,
  },
];

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('✅  Database connected');

    let created = 0;
    let skipped = 0;

    for (const dt of DOCUMENT_TYPES) {
      const existing = await DocumentType.findOne({ where: { name: dt.name } });
      if (existing) {
        console.log(`⏭   Skipped  "${dt.name}"  (already exists)`);
        skipped++;
        continue;
      }
      await DocumentType.create(dt);
      console.log(`✅  Created  "${dt.name}"`);
      created++;
    }

    console.log(`\n── Seed complete: ${created} created, ${skipped} skipped ──`);
  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

seed();
