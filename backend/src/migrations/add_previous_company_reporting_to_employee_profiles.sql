-- =============================================================================
-- Migration: add_previous_company_reporting_to_employee_profiles.sql
-- Adds three nullable columns to employee_profiles for previous employer details
-- and reporting structure notes.
-- All columns are NULL-able for non-destructive, backward-compatible migration.
-- FR-04 | Spec s.4.5 (previous employment details + career progression)
--
-- NOTE: MySQL does not support ADD COLUMN IF NOT EXISTS (MariaDB-only syntax).
-- Run this script once on a fresh schema, or check column existence manually
-- before executing if the migration may have been partially applied.
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN previous_company_name    VARCHAR(200)   NULL
    COMMENT 'Name of most recent employer before joining. HR Admin registration field.',

  ADD COLUMN previous_salary_monthly  DECIMAL(10,2)  NULL
    COMMENT 'Monthly salary at previous employer (MUR). Used for benchmarking and offer context.',

  ADD COLUMN reporting_notes          VARCHAR(500)   NULL
    COMMENT 'Additional notes on reporting structure or responsibilities beyond the assigned line manager.';
