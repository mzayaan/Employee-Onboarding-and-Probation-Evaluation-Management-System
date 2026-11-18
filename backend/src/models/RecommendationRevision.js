// =============================================================================
// src/models/RecommendationRevision.js
// Table: recommendation_revisions
//
// Immutable audit trail for every manager correction-and-resubmission of a
// returned probation recommendation (G08).
//
// Each row records:
//   - who made the correction (actor_id) and when (revised_at, server clock)
//   - the reason given for the correction (correction_reason)
//   - JSON snapshots of evaluation scores before and after (before_scores / after_scores)
//   - per-checkpoint weighted-score totals before and after
//   - cumulative score and recommendation type before and after
//   - the justification text before and after
//   - the HR / Director return reasons that prompted the correction (preserved for audit)
//
// Rows are INSERT-only; no UPDATE or DELETE is ever issued against this table.
//
// FR-15, FR-18 | G08 | NFR-02, NFR-08 | Objective 3
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize     = require('../config/database');

const RecommendationRevision = sequelize.define('RecommendationRevision', {
  revision_id: {
    type:          DataTypes.BIGINT.UNSIGNED,
    primaryKey:    true,
    autoIncrement: true,
  },

  rec_id: {
    type:      DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment:   'FK → final_recommendations.rec_id',
  },

  actor_id: {
    type:      DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment:   'FK → users.user_id — the Line Manager who submitted the correction',
  },

  revised_at: {
    type:         DataTypes.DATE,
    allowNull:    false,
    defaultValue: DataTypes.NOW,
    comment:      'Server timestamp at which the correction was committed',
  },

  correction_reason: {
    type:      DataTypes.TEXT,
    allowNull: false,
    comment:   'Mandatory explanation for why scores were corrected on resubmission',
  },

  // ── Score snapshots ───────────────────────────────────────────────────────
  before_scores: {
    type:    DataTypes.JSON,
    allowNull: true,
    comment: 'Array of { score_id, eval_id, criterion_id, raw_score, weight_percent_at_scoring, weighted_contribution } before correction',
  },
  after_scores: {
    type:    DataTypes.JSON,
    allowNull: true,
    comment: 'Array of score snapshots after correction',
  },

  // ── Checkpoint-level weighted totals ────────────────────────────────────
  before_checkpoint_totals: {
    type:    DataTypes.JSON,
    allowNull: true,
    comment: 'Object keyed by checkpoint_id: weighted_score value before recalculation',
  },
  after_checkpoint_totals: {
    type:    DataTypes.JSON,
    allowNull: true,
    comment: 'Object keyed by checkpoint_id: weighted_score value after recalculation',
  },

  // ── Cumulative and recommendation type ───────────────────────────────────
  before_cumulative_score: {
    type:      DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  after_cumulative_score: {
    type:      DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },

  before_recommendation_type: {
    type:      DataTypes.ENUM('CONFIRM', 'EXTEND', 'DISMISS'),
    allowNull: false,
  },
  after_recommendation_type: {
    type:      DataTypes.ENUM('CONFIRM', 'EXTEND', 'DISMISS'),
    allowNull: false,
  },

  // ── Justification text ───────────────────────────────────────────────────
  before_justification: {
    type:    DataTypes.TEXT,
    allowNull: true,
  },
  after_justification: {
    type:    DataTypes.TEXT,
    allowNull: false,
  },

  // ── Preserved return reasons ─────────────────────────────────────────────
  hr_return_reason: {
    type:    DataTypes.TEXT,
    allowNull: true,
    comment: 'hr_endorsement_notes value at time of correction (HR return path)',
  },
  director_return_reason: {
    type:    DataTypes.TEXT,
    allowNull: true,
    comment: 'director_reason value at time of correction (Director return path)',
  },
}, {
  tableName:  'recommendation_revisions',
  timestamps: false,
});

module.exports = RecommendationRevision;
