// =============================================================================
// src/controllers/systemConfigController.js
// System configuration endpoints — minimum salary management.
//
// The system_configs table stores an append-only history of minimum-salary
// baseline values. Each new legislative change creates a new row; historical
// rows are never modified or deleted (audit trail).
//
// Spec s.1.3, s.2.2 | FR-NEW-02 | NFR-08
// SYSTEM_ADMIN only for write operations.
// =============================================================================

const { Op }          = require('sequelize');
const SystemConfig    = require('../models/SystemConfig');
const { User }        = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

// ── GET /api/system-config/current ──────────────────────────────────────────
// Returns the single row with the highest effective_date that is on or before
// today's date — i.e. the rate that is currently in force.
// All authenticated roles may read this (salary validation needs it).
const getCurrentConfig = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const config = await SystemConfig.findOne({
      where: { effective_date: { [Op.lte]: today } },
      order: [['effective_date', 'DESC']],
      include: [{
        model: User,
        as:    'updatedByUser',
        attributes: ['user_id', 'first_name', 'last_name', 'email'],
        required: false,
      }],
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'No active system configuration found.',
      });
    }

    return res.json({ success: true, data: config });
  } catch (error) {
    console.error('[systemConfigController.getCurrentConfig]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve configuration.' });
  }
};

// ── GET /api/system-config/history ──────────────────────────────────────────
// Returns all configuration rows in reverse chronological order.
// SYSTEM_ADMIN only.
const getConfigHistory = async (req, res) => {
  try {
    const configs = await SystemConfig.findAll({
      order: [['effective_date', 'DESC']],
      include: [{
        model: User,
        as:    'updatedByUser',
        attributes: ['user_id', 'first_name', 'last_name', 'email'],
        required: false,
      }],
    });

    return res.json({ success: true, data: configs });
  } catch (error) {
    console.error('[systemConfigController.getConfigHistory]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve configuration history.' });
  }
};

// ── POST /api/system-config ──────────────────────────────────────────────────
// Creates a new minimum-salary entry.
// SYSTEM_ADMIN only. Never modifies existing rows.
//
// Body: { min_salary_mur: number, effective_date: 'YYYY-MM-DD' }
const createConfig = async (req, res) => {
  try {
    const { min_salary_mur, effective_date } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (min_salary_mur === undefined || min_salary_mur === null) {
      return res.status(400).json({ success: false, message: 'min_salary_mur is required.' });
    }
    if (!effective_date) {
      return res.status(400).json({ success: false, message: 'effective_date is required.' });
    }

    const salary = parseFloat(min_salary_mur);
    if (isNaN(salary) || salary <= 0) {
      return res.status(400).json({ success: false, message: 'min_salary_mur must be a positive number.' });
    }

    // Basic date format check
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effective_date)) {
      return res.status(400).json({ success: false, message: 'effective_date must be in YYYY-MM-DD format.' });
    }

    // Warn (but do not block) if the effective_date duplicates an existing entry
    const duplicate = await SystemConfig.findOne({ where: { effective_date } });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `A configuration entry already exists for effective date ${effective_date}. Create a new row with a different date to update the baseline.`,
      });
    }

    const config = await SystemConfig.create({
      min_salary_mur: salary,
      effective_date,
      updated_by: req.user.user_id,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'CREATE_SYSTEM_CONFIG',
      description: `System Administrator set minimum salary to MUR ${salary.toFixed(2)} effective ${effective_date}.`,
    });

    return res.status(201).json({
      success: true,
      message: 'Minimum salary configuration saved.',
      data:    config,
    });
  } catch (error) {
    console.error('[systemConfigController.createConfig]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to save configuration.' });
  }
};

module.exports = { getCurrentConfig, getConfigHistory, createConfig };
