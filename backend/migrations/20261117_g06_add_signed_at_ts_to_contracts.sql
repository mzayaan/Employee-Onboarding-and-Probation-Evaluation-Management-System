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

-- Step 2: Back-fill from updated_at for any rows already signed
--   updated_at is set to NOW() atomically in the same Contract.update() call
--   that sets signed_at, so it is the best available proxy for existing rows.
UPDATE contracts
  SET signed_at_ts = updated_at
WHERE signed_at IS NOT NULL
  AND signed_at_ts IS NULL;

-- Rollback (run manually if needed):
--   ALTER TABLE contracts DROP COLUMN signed_at_ts;
