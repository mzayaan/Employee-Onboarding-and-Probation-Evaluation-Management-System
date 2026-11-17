-- =============================================================================
-- Migration: 20261117_add_name_at_scoring_to_score_tables.sql
--
-- Adds name_at_scoring (VARCHAR 100 NULL) to evaluation_scores and
-- self_assessment_scores so that the criterion name visible on historical
-- evaluation records and generated PDF reports is frozen at submission time
-- (G09-FIX Fix 3 — historical criterion name freezing, FR-14).
--
-- Without this column, renaming a criterion in the System Administrator
-- configuration page silently changes the label that appears on all past
-- evaluations and PDF reports, which breaks audit traceability.
--
-- Idempotent: MySQL ADD COLUMN ... IF NOT EXISTS is safe to re-run.
-- If the column already exists the statement is a no-op.
--
-- To apply manually:
--   mysql -u <user> -p <database_name> < 20261117_add_name_at_scoring_to_score_tables.sql
-- =============================================================================

-- Step 1: evaluation_scores
ALTER TABLE evaluation_scores
  ADD COLUMN IF NOT EXISTS name_at_scoring VARCHAR(100) NULL
    COMMENT 'G09-FIX: Snapshot of criterion name at evaluation submission time. NULL for rows inserted before this migration.'
  AFTER weight_percent_at_scoring;

-- Step 2: self_assessment_scores
ALTER TABLE self_assessment_scores
  ADD COLUMN IF NOT EXISTS name_at_scoring VARCHAR(100) NULL
    COMMENT 'G09-FIX: Snapshot of criterion name at self-assessment submission time. NULL for rows inserted before this migration.'
  AFTER weight_percent_at_scoring;

-- Historical rows (NULL name_at_scoring) are handled gracefully by the
-- application code: it falls back to the live criterion name when
-- name_at_scoring IS NULL (pdfHelpers.js buildCriteriaMap).

-- Rollback (run manually if needed):
--   ALTER TABLE evaluation_scores      DROP COLUMN name_at_scoring;
--   ALTER TABLE self_assessment_scores DROP COLUMN name_at_scoring;
