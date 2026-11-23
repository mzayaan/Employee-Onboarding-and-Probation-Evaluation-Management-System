-- =============================================================================
-- Migration: 20261118_g08_recommendation_revisions.sql
--
-- Creates the recommendation_revisions table for G08 — controlled correction
-- and resubmission of returned probation recommendations.
--
-- Each row is an immutable revision record written atomically with every
-- successful revise-and-resubmit operation.  No UPDATE or DELETE is issued
-- against this table after insertion.
--
-- Prerequisites:
--   • final_recommendations table exists (migration series before G08).
--   • users table exists.
--
-- FR-15, FR-18 | G08 | NFR-02, NFR-08 | Objective 3
-- =============================================================================

CREATE TABLE IF NOT EXISTS `recommendation_revisions` (
  `revision_id`               BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  -- G08 (Finding 6 — FK signedness): parent final_recommendations.rec_id and
  -- users.user_id are signed INT columns.  Using INT UNSIGNED here would cause
  -- MySQL to refuse the foreign-key constraint (ERROR 1215) on a fresh install.
  `rec_id`                    INT              NOT NULL COMMENT 'FK → final_recommendations.rec_id',
  `actor_id`                  INT              NOT NULL COMMENT 'FK → users.user_id',
  `revised_at`                DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Server timestamp at commit',
  `correction_reason`         TEXT             NOT NULL COMMENT 'Mandatory explanation for the correction',

  -- Score snapshots (NULL when resubmission is justification-only)
  `before_scores`             JSON             NULL     COMMENT 'Array of score snapshots before correction',
  `after_scores`              JSON             NULL     COMMENT 'Array of score snapshots after correction',

  -- Per-checkpoint weighted-score totals
  `before_checkpoint_totals`  JSON             NULL     COMMENT 'Object keyed by checkpoint_id: weighted_score before',
  `after_checkpoint_totals`   JSON             NULL     COMMENT 'Object keyed by checkpoint_id: weighted_score after',

  -- Cumulative scores
  `before_cumulative_score`   DECIMAL(5,2)     NULL,
  `after_cumulative_score`    DECIMAL(5,2)     NULL,

  -- Recommendation types
  `before_recommendation_type` ENUM('CONFIRM','EXTEND','DISMISS') NOT NULL,
  `after_recommendation_type`  ENUM('CONFIRM','EXTEND','DISMISS') NOT NULL,

  -- Justification text
  `before_justification`      TEXT             NULL,
  `after_justification`       TEXT             NOT NULL,

  -- Preserved return reasons (from HR / Director)
  `hr_return_reason`          TEXT             NULL     COMMENT 'hr_endorsement_notes at time of correction',
  `director_return_reason`    TEXT             NULL     COMMENT 'director_reason at time of correction',

  PRIMARY KEY (`revision_id`),

  CONSTRAINT `fk_revisions_rec`
    FOREIGN KEY (`rec_id`)
    REFERENCES `final_recommendations` (`rec_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT `fk_revisions_actor`
    FOREIGN KEY (`actor_id`)
    REFERENCES `users` (`user_id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  INDEX `idx_revisions_rec_id`   (`rec_id`),
  INDEX `idx_revisions_actor_id` (`actor_id`),
  INDEX `idx_revisions_revised_at` (`revised_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Immutable audit trail of manager correction-and-resubmission events (G08)';
