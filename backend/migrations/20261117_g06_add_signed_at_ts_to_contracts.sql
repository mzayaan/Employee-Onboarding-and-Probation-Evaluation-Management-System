-- =============================================================================
-- Migration: 20261117_g06_add_signed_at_ts_to_contracts.sql
-- Adds a DATETIME precision column (signed_at_ts) to the contracts table so
-- the precise signing instant can be stored directly alongside the existing
-- DATEONLY signed_at column.
--
-- Context (G06-D1 / G06-D6):
--   signed_at is DataTypes.DATEONLY — it stores only a calendar date, not a
--   time-of-day.  After the G06 fix, the precise signing instant is captured
--   directly in signed_at_ts by contractController.js (signContract function).
--
-- *** THIS MIGRATION IS REQUIRED ***
--   contractController.js (signContract) unconditionally sets
--   signed_at_ts: now in the Contract.update() payload.  Without the column
--   present in the database, MySQL will throw:
--     "Unknown column 'signed_at_ts' in 'field list'"
--   on every contract signing attempt.  This migration must be applied before
--   the signContract endpoint is used.
--
--   The column is added as NULL so that historical rows that were signed before
--   this migration was applied are preserved with signed_at_ts = NULL (see
--   historical-row rationale below).  Only new signings will have a non-NULL
--   value.  The calendar-date approximation (signed_at) and the SIGN_CONTRACT
--   audit_logs entry remain available for any rows signed before this migration.
--
-- DO NOT APPLY to the live database without supervisor/HR approval.
-- Apply with:
--   mysql -u <user> -p <database_name> < 20261117_g06_add_signed_at_ts_to_contracts.sql
-- =============================================================================

-- Step 1: Add signed_at_ts as a nullable DATETIME column
ALTER TABLE contracts
  ADD COLUMN signed_at_ts DATETIME NULL
    COMMENT 'Precise UTC datetime of digital signing (G06). NULL until signed. Complements signed_at (DATEONLY) which stores only the calendar date.'
  AFTER signed_at;

-- Step 2: Historical rows with signed_at already set are left with signed_at_ts = NULL.
--
--   Rationale (G06-D6 correction): updated_at on a pre-existing signed row reflects the
--   LAST time that row was touched, not necessarily the original signing instant.
--   Backfilling it as the signing time would introduce a silent inaccuracy for every
--   row that was subsequently updated (e.g. corrected salary, HR edits).
--
--   The precise signing instant for future signings is captured in signed_at_ts by the
--   Contract.update() payload in contractController.js.  Historical rows where the
--   precise instant is unknown are intentionally left NULL — no data is better than
--   silently wrong data.
--
--   The calendar-date approximation (signed_at) and the audit_logs entry for
--   SIGN_CONTRACT remain available for any rows signed before this migration was applied.
--
-- (No UPDATE statement needed — NULL is already the column default.)

-- Rollback (run manually if needed):
--   ALTER TABLE contracts DROP COLUMN signed_at_ts;
