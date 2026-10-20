// =============================================================================
// src/models/FinalRecommendation.js
// Table 15: final_recommendations
// FR-15, FR-22, FR-23, FR-24 | Objective 3
// Thresholds: >= 75 = CONFIRM, 50–74.99 = EXTEND, < 50 = DISMISS
//
// Three-stage approval workflow (per lecturer requirement):
//   Manager submits → PENDING_HR_REVIEW
//   HR endorses     → PENDING_DIRECTOR
//   HR returns      → RETURNED_TO_MANAGER (manager revises and resubmits)
//   Director views  → UNDER_REVIEW
//   Director decides → APPROVED (triggers employment_status update + PDF generation)
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FinalRecommendation = sequelize.define('FinalRecommendation', {
  rec_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  period_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to probation_periods — one recommendation per period',
  },
  recommendation_type: {
    type: DataTypes.ENUM('CONFIRM', 'EXTEND', 'DISMISS'),
    allowNull: false,
  },
  cumulative_score: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    comment: 'Final average score: >= 75 = CONFIRM, 50-74.99 = EXTEND, < 50 = DISMISS',
  },

  // ── Approval workflow fields ───────────────────────────────────────────────
  approval_status: {
    type: DataTypes.ENUM(
      'PENDING_HR_REVIEW',     // Manager submitted — awaiting HR endorsement
      'RETURNED_TO_MANAGER',   // HR returned for revision — manager must resubmit
      'PENDING_DIRECTOR',      // HR endorsed — awaiting Director decision
      'UNDER_REVIEW',          // Director has opened and is reviewing
      'APPROVED'               // Director approved — triggers PDF generation and employment_status update
    ),
    allowNull: false,
    defaultValue: 'PENDING_HR_REVIEW',
  },
  rejection_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of times HR returned the recommendation to the manager',
  },

  // ── Manager submission fields ──────────────────────────────────────────────
  submitted_by: {
    type: DataTypes.INTEGER,
    allowNull: true,   // nullable so ALTER TABLE succeeds on existing rows;
                       // service layer enforces presence on new submissions
    comment: 'FK to users (LINE_MANAGER) — the manager who generated and submitted the recommendation',
  },
  justification: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Manager written justification for the recommendation — required on submission',
  },
  generated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  generated_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to users — same as submitted_by for new flow; retained for backward compatibility',
  },

  // ── HR endorsement fields ──────────────────────────────────────────────────
  endorsed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to users (HR_ADMIN) — the HR officer who endorsed the recommendation',
  },
  endorsed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  hr_endorsement_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'HR notes when endorsing or when returning to manager',
  },
  submitted_to_director_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when HR forwarded the endorsed recommendation to the Director',
  },

  // ── Director decision fields ───────────────────────────────────────────────
  director_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to users (DIRECTOR) — the Director who made the final decision',
  },
  director_decision_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of the Director final decision',
  },
  director_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Director notes or reason for the approval decision',
  },

  // ── Extension fields ───────────────────────────────────────────────────────
  extension_duration_months: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Number of months for probation extension — populated when recommendation_type = EXTEND',
  },
}, {
  tableName: 'final_recommendations',
  timestamps: false,
});

module.exports = FinalRecommendation;
