-- =============================================================================
-- Migration: 20261117_add_cancelled_to_probation_enums.sql
--
-- Adds the CANCELLED value to the status ENUM in two tables so that probation
-- periods and their checkpoints can be voided when a contract with no probation
-- clause is created (WRA 2019 s.13 / G07).
--
-- DO NOT apply DISMISSED for a cancelled probation; use CANCELLED instead.
--
-- Idempotent: MySQL MODIFY COLUMN on an ENUM is safe to re-run; it replaces the
-- existing column definition in full.  Running this twice has no harmful effect.
--
-- To apply manually (review-only — do not run against live DB without approval):
--   mysql -u <user> -p <database_name> < migrations/20261117_add_cancelled_to_probation_enums.sql
-- =============================================================================

ALTER TABLE probation_periods
  MODIFY COLUMN status
    ENUM('ACTIVE', 'COMPLETED', 'EXTENDED', 'CONFIRMED', 'DISMISSED', 'CANCELLED')
    NOT NULL
    DEFAULT 'ACTIVE'
    COMMENT 'CONFIRMED = employment confirmed by Director; DISMISSED = employment terminated per WRA 2019; CANCELLED = probation voided because contract has no probation clause';

ALTER TABLE evaluation_checkpoints
  MODIFY COLUMN status
    ENUM('PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED')
    NOT NULL
    DEFAULT 'PENDING'
    COMMENT 'CANCELLED = checkpoint voided because the associated probation period was cancelled';
