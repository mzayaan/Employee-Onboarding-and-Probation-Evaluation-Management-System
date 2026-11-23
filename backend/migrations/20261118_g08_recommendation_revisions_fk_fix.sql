-- =============================================================================
-- Corrective migration: 20261118_g08_recommendation_revisions_fk_fix.sql
--
-- G08 (Finding 6 — FK signedness): the original migration
-- 20261118_g08_recommendation_revisions.sql declared rec_id and actor_id as
-- INT UNSIGNED, while the parent columns are signed INT:
--
--   final_recommendations.rec_id  → INT (signed)  [FinalRecommendation model]
--   users.user_id                 → INT (signed)  [User model]
--
-- MySQL requires that a FK column's signedness exactly matches the referenced
-- column; a mismatch causes the FK constraint to be rejected at CREATE TABLE
-- time (errno 150 / ER_CANNOT_ADD_FOREIGN).
--
-- This corrective script changes both columns from INT UNSIGNED to INT (signed)
-- to match their parent columns.
--
-- DO NOT APPLY if the original migration has not yet been applied (the table
-- does not exist).  Apply the original migration first (or apply this script
-- immediately after, before any rows are inserted).
--
-- Prerequisites:
--   • recommendation_revisions table exists.
--   • No rows exist yet (safe to run before any production data is loaded).
--
-- FR-18 | G08 | NFR-02, NFR-08 | Objective 3
-- =============================================================================

-- Step 1: Drop the foreign-key constraints that reference the mistyped columns.
ALTER TABLE `recommendation_revisions`
  DROP FOREIGN KEY `fk_revisions_rec`,
  DROP FOREIGN KEY `fk_revisions_actor`;

-- Step 2: Change the column types from INT UNSIGNED to INT (signed).
ALTER TABLE `recommendation_revisions`
  MODIFY COLUMN `rec_id`   INT NOT NULL COMMENT 'FK → final_recommendations.rec_id',
  MODIFY COLUMN `actor_id` INT NOT NULL COMMENT 'FK → users.user_id';

-- Step 3: Re-add the foreign-key constraints with the corrected column types.
ALTER TABLE `recommendation_revisions`
  ADD CONSTRAINT `fk_revisions_rec`
    FOREIGN KEY (`rec_id`)
    REFERENCES `final_recommendations` (`rec_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_revisions_actor`
    FOREIGN KEY (`actor_id`)
    REFERENCES `users` (`user_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
