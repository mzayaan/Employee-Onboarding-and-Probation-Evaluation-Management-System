-- =============================================================================
-- seed_missing_checkpoints.sql
-- Creates Day-30, Day-60, Day-90 evaluation checkpoints for any probation
-- period that currently has NONE.  Safe to run multiple times (INSERT IGNORE).
-- Run in MySQL Workbench against the project database.
-- =============================================================================

INSERT IGNORE INTO evaluation_checkpoints
  (period_id, checkpoint_label, day_number, due_date, status, created_at)
SELECT
  pp.period_id,
  CONCAT('Day-', d.day_number, ' Review')          AS checkpoint_label,
  d.day_number,
  DATE_ADD(pp.start_date, INTERVAL d.day_number DAY) AS due_date,
  CASE
    WHEN DATE_ADD(pp.start_date, INTERVAL d.day_number DAY) < CURDATE() THEN 'OVERDUE'
    ELSE 'PENDING'
  END                                               AS status,
  NOW()                                             AS created_at
FROM probation_periods pp
-- Only rows that have NO checkpoints yet
LEFT JOIN evaluation_checkpoints ec ON ec.period_id = pp.period_id
CROSS JOIN (
  SELECT 30 AS day_number UNION ALL
  SELECT 60              UNION ALL
  SELECT 90
) d
WHERE ec.checkpoint_id IS NULL;
