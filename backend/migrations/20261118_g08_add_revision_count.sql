-- =============================================================================
-- Migration: 20261118_g08_add_revision_count.sql
--
-- Adds revision_count to final_recommendations for G08 stale-revision
-- protection.  endorseRecommendation and approveRecommendation accept an
-- optional revision_count in their request body; if the value does not match
-- the stored count the request is rejected with 409, preventing HR or the
-- Director from acting on a recommendation that the manager has since revised.
--
-- reviseAndResubmitRecommendation increments this column on every successful
-- revise-and-resubmit commit so the counter stays current.
--
-- Prerequisites:
--   • 20261118_g08_recommendation_revisions.sql has been applied
--     (final_recommendations table exists).
--
-- FR-15, FR-18 | G08 | NFR-02, NFR-03 | Objective 3
-- =============================================================================

ALTER TABLE `final_recommendations`
  ADD COLUMN `revision_count` INT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Incremented on each revise-and-resubmit; used for optimistic staleness detection (G08)';
