// =============================================================================
// src/controllers/criteriaController.js
// CRUD for evaluation criteria — System Admin only.
// Active criteria weights must sum to exactly 100%.
// FR-10 | NFR-03 | Objective 2
// =============================================================================

const { EvaluationCriterion } = require('../models');
const { Op }                   = require('sequelize');
const logAudit                 = require('../utils/auditLogger');

// ── GET /api/criteria ─────────────────────────────────────────────────────────
// List all criteria ordered by display_order then name.
const getCriteria = async (req, res) => {
  try {
    const criteria = await EvaluationCriterion.findAll({
      order: [
        ['display_order', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    res.json({ success: true, data: criteria });
  } catch (error) {
    console.error('[Criteria] getCriteria error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve evaluation criteria.' });
  }
};

// ── POST /api/criteria ────────────────────────────────────────────────────────
// Create a new criterion.
// Validates that adding the new weight will not push the active total above 100%.
const createCriterion = async (req, res) => {
  const { name, description, weight_percent, display_order } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Criterion name is required.' });
  }
  const weight = parseFloat(weight_percent);
  if (isNaN(weight) || weight <= 0 || weight > 100) {
    return res.status(400).json({ success: false, message: 'Weight must be a number between 1 and 100.' });
  }

  try {
    // Sum current active weights
    const active = await EvaluationCriterion.findAll({ where: { is_active: true } });
    const currentTotal = active.reduce((sum, c) => sum + parseFloat(c.weight_percent), 0);

    if (parseFloat((currentTotal + weight).toFixed(2)) > 100) {
      return res.status(400).json({
        success: false,
        message: `Adding ${weight}% would exceed 100%. Current total: ${currentTotal.toFixed(2)}%.`,
      });
    }

    const criterion = await EvaluationCriterion.create({
      name:          name.trim(),
      description:   description?.trim() || null,
      weight_percent: weight,
      display_order: display_order ?? 0,
      is_active:     true,
      created_by:    req.user.user_id,
    });

    await logAudit({
      userId:     req.user.user_id,
      actionType: 'CRITERIA_CREATED',
      entityType: 'EvaluationCriterion',
      entityId:   criterion.criterion_id,
      details:    `Created criterion "${criterion.name}" with weight ${weight}%`,
      req,
    });

    res.status(201).json({ success: true, data: criterion });
  } catch (error) {
    console.error('[Criteria] createCriterion error:', error);
    res.status(500).json({ success: false, message: 'Failed to create criterion.' });
  }
};

// ── PUT /api/criteria/:id ─────────────────────────────────────────────────────
// Update name, description, weight or active status.
const updateCriterion = async (req, res) => {
  const { id } = req.params;
  const { name, description, weight_percent, is_active, display_order } = req.body;

  try {
    const criterion = await EvaluationCriterion.findByPk(id);
    if (!criterion) {
      return res.status(404).json({ success: false, message: 'Criterion not found.' });
    }

    // Validate new weight if provided
    if (weight_percent !== undefined) {
      const newWeight = parseFloat(weight_percent);
      if (isNaN(newWeight) || newWeight <= 0 || newWeight > 100) {
        return res.status(400).json({ success: false, message: 'Weight must be between 1 and 100.' });
      }

      // Sum all OTHER active criteria
      const others = await EvaluationCriterion.findAll({
        where: {
          is_active:    true,
          criterion_id: { [Op.ne]: id },
        },
      });
      const othersTotal = others.reduce((sum, c) => sum + parseFloat(c.weight_percent), 0);

      // When activating a previously inactive criterion also check
      const effectivelyActive = is_active !== undefined ? is_active : criterion.is_active;
      if (effectivelyActive && parseFloat((othersTotal + newWeight).toFixed(2)) > 100) {
        return res.status(400).json({
          success: false,
          message: `Weight would push total above 100%. Other active criteria sum: ${othersTotal.toFixed(2)}%.`,
        });
      }

      criterion.weight_percent = newWeight;
    }

    if (name !== undefined)          criterion.name          = name.trim();
    if (description !== undefined)   criterion.description   = description?.trim() || null;
    if (is_active !== undefined)     criterion.is_active     = Boolean(is_active);
    if (display_order !== undefined) criterion.display_order = display_order;
    criterion.updated_at = new Date();

    await criterion.save();

    await logAudit({
      userId:     req.user.user_id,
      actionType: 'CRITERIA_UPDATED',
      entityType: 'EvaluationCriterion',
      entityId:   criterion.criterion_id,
      details:    `Updated criterion "${criterion.name}"`,
      req,
    });

    res.json({ success: true, data: criterion });
  } catch (error) {
    console.error('[Criteria] updateCriterion error:', error);
    res.status(500).json({ success: false, message: 'Failed to update criterion.' });
  }
};

// ── DELETE /api/criteria/:id ──────────────────────────────────────────────────
// Soft-delete: marks criterion as inactive rather than destroying the record,
// preserving historical evaluation scores that reference it.
const deactivateCriterion = async (req, res) => {
  const { id } = req.params;
  try {
    const criterion = await EvaluationCriterion.findByPk(id);
    if (!criterion) {
      return res.status(404).json({ success: false, message: 'Criterion not found.' });
    }

    criterion.is_active   = false;
    criterion.updated_at  = new Date();
    await criterion.save();

    await logAudit({
      userId:     req.user.user_id,
      actionType: 'CRITERIA_DEACTIVATED',
      entityType: 'EvaluationCriterion',
      entityId:   criterion.criterion_id,
      details:    `Deactivated criterion "${criterion.name}"`,
      req,
    });

    res.json({ success: true, message: 'Criterion deactivated.' });
  } catch (error) {
    console.error('[Criteria] deactivateCriterion error:', error);
    res.status(500).json({ success: false, message: 'Failed to deactivate criterion.' });
  }
};

module.exports = { getCriteria, createCriterion, updateCriterion, deactivateCriterion };
