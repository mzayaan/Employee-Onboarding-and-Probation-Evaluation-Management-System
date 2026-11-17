-- =============================================================================
-- Migration: 20261117_g06_add_signed_at_ts_to_contracts.sql
-- Adds a DATETIME precision column (signed_at_ts) to the contracts table so
-- the precise signing instant can be stored directly alongside the existing
-- DATEONLY signed_at column.
--
-- Context (G06-D1 / G06-D6):
--   signed_at is DataTypes.DATEONLY — it stores only a calendar date, not a
--   time-of-day.  After the G06 fix, the precise signing instant is already
--   captured indirectly via:
--     1. updated_at   (DataTypes.DATE = DATETIME) on the contracts row itself.
--     2. created_at   (DATETIME) of the SIGN_CONTRACT audit_logs entry.
--   Both of those are sufficient for a viva demonstration and for practical
--   audit purposes.
--
--   This migration adds an OPTIONAL dedicated column so the precise instant is
--   self-contained on the contracts record without needing a JOIN to audit_logs.
--   It is NOT required for the system to function correctly.
--
-- DO NOT APPLY to the live database without supervisor/HR approval.
-- Apply with:
--   mysql -u <user> -p <database_name> < 20261117_g06_add_signed_at_ts_to_contracts.sql
-- =============================================================================

-- Step 1: Add signed_at_ts as a nullable DATETIME column
ALTER TABLE contracts
  ADD COLUMN signed_at_ts DATETIME NULL
    COMMENT 'Precise UTC datetime of digital signing (G06). NULL until signed. '
            'Complements signed_at (DATEONLY) which stores only the calendar date.'
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
