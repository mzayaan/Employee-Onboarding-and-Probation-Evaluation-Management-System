-- =============================================================================
-- Migration 004 — Enhancements (November 2026)
-- Employee Onboarding and Probation Evaluation Management System
-- FR-12 (Performance Notes KPI), FR-13 (Self-Assessment two-way probation),
-- FR-12 (Development Reviews)
--
-- Compatible with MySQL 5.7+ and MySQL 8.x.
-- Uses INFORMATION_SCHEMA checks inside a procedure to safely add columns
-- without the MySQL 8.0.3+ ADD COLUMN IF NOT EXISTS syntax.
--
-- Run this script once against the development / production database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper procedure: adds a column only when it does not already exist.
-- Usage: CALL _add_col_if_missing('table', 'column', 'column_definition');
-- The procedure is dropped at the end of this script.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _add_col_if_missing;

DELIMITER $$
CREATE PROCEDURE _add_col_if_missing(
  IN p_table  VARCHAR(64),
  IN p_col    VARCHAR(64),
  IN p_def    TEXT
)
BEGIN
  -- Read the current database name at runtime
  SET @db = DATABASE();

  SELECT COUNT(*) INTO @exists
  FROM   information_schema.COLUMNS
  WHERE  TABLE_SCHEMA = @db
    AND  TABLE_NAME   = p_table
    AND  COLUMN_NAME  = p_col;

  IF @exists = 0 THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_col, '` ', p_def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------------
-- Helper procedure: adds a CHECK constraint only when it does not already
-- exist (MySQL 8.0.16+ enforces CHECK; 5.7 silently parses but ignores it).
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _add_check_if_missing;

DELIMITER $$
CREATE PROCEDURE _add_check_if_missing(
  IN p_table      VARCHAR(64),
  IN p_constraint VARCHAR(64),
  IN p_expr       TEXT
)
BEGIN
  SET @db = DATABASE();

  -- TABLE_CONSTRAINTS is available in both 5.7 and 8.x
  SELECT COUNT(*) INTO @exists
  FROM   information_schema.TABLE_CONSTRAINTS
  WHERE  TABLE_SCHEMA     = @db
    AND  TABLE_NAME        = p_table
    AND  CONSTRAINT_NAME   = p_constraint
    AND  CONSTRAINT_TYPE   = 'CHECK';

  IF @exists = 0 THEN
    SET @sql = CONCAT(
      'ALTER TABLE `', p_table,
      '` ADD CONSTRAINT `', p_constraint,
      '` CHECK (', p_expr, ')'
    );
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;


-- =============================================================================
-- 1.  self_assessments — Two-Way Probation Fields (FR-13 | Objective 2)
-- =============================================================================

CALL _add_col_if_missing('self_assessments', 'onboarding_progress_notes',
  'TEXT NULL COMMENT "Employee response: How is your onboarding progressing?"');

CALL _add_col_if_missing('self_assessments', 'understands_responsibilities',
  'ENUM(''Yes'',''Partially'',''No'') NULL COMMENT "Do you understand your responsibilities?"');

CALL _add_col_if_missing('self_assessments', 'received_sufficient_training',
  'ENUM(''Yes'',''Partially'',''No'') NULL COMMENT "Have you received sufficient training?"');

CALL _add_col_if_missing('self_assessments', 'has_required_system_access',
  'ENUM(''Yes'',''Partially'',''No'') NULL COMMENT "Do you have the required system access?"');

CALL _add_col_if_missing('self_assessments', 'areas_needing_support',
  'TEXT NULL COMMENT "Areas where additional support is required"');

CALL _add_col_if_missing('self_assessments', 'training_support_requested',
  'TEXT NULL COMMENT "Training or support requested by the employee"');

CALL _add_col_if_missing('self_assessments', 'employee_comments',
  'TEXT NULL COMMENT "General employee comments on the probation process"');

CALL _add_col_if_missing('self_assessments', 'employee_acknowledgement_date',
  'DATE NULL COMMENT "Date the employee formally acknowledged this self-assessment"');


-- =============================================================================
-- 2.  performance_notes — KPI Review Fields (FR-12 | Objective 2)
-- =============================================================================

CALL _add_col_if_missing('performance_notes', 'note_category',
  'ENUM(''GENERAL'',''WORK_RELATED_KPI'',''SOFT_SKILLS_KPI'',''BEHAVIORAL_KPI'',''EMPLOYEE_FEEDBACK'') NOT NULL DEFAULT ''GENERAL'' COMMENT "Category of the performance note or KPI review"');

CALL _add_col_if_missing('performance_notes', 'kpi_target',
  'TEXT NULL COMMENT "The agreed KPI target or expectation for this criterion"');

CALL _add_col_if_missing('performance_notes', 'kpi_achievement',
  'TEXT NULL COMMENT "What the employee actually achieved against this KPI"');

CALL _add_col_if_missing('performance_notes', 'kpi_rating',
  'TINYINT NULL COMMENT "Manager rating 1-5 for this KPI criterion"');

CALL _add_col_if_missing('performance_notes', 'employee_response',
  'TEXT NULL COMMENT "Employee response or comments on this performance note"');

-- CHECK constraint on kpi_rating (MySQL 8.0.16+ enforces; 5.7 accepts silently)
CALL _add_check_if_missing('performance_notes', 'chk_kpi_rating',
  'kpi_rating IS NULL OR (kpi_rating >= 1 AND kpi_rating <= 5)');


-- =============================================================================
-- 3.  development_reviews — New Table (FR-12 | Objective 2)
-- =============================================================================

CREATE TABLE IF NOT EXISTS development_reviews (
  review_id                     INT            NOT NULL AUTO_INCREMENT,
  profile_id                    INT            NOT NULL
    COMMENT 'FK to employee_profiles',
  checkpoint_id                 INT            NULL
    COMMENT 'FK to evaluation_checkpoints (optional)',
  reviewed_by                   INT            NOT NULL
    COMMENT 'FK to users — HR Admin or Line Manager',

  work_life_balance_rating      ENUM(
    'Well Balanced',
    'Mostly Balanced',
    'Somewhat Unbalanced',
    'Very Unbalanced'
  )                             NULL,
  workload_assessment           TEXT           NULL,

  professional_balance_notes    TEXT           NULL,
  professional_development_goals TEXT          NULL,

  actions_to_balance            TEXT           NULL,
  support_offered               TEXT           NULL,

  next_review_date              DATE           NULL,
  employee_acknowledgement      TINYINT(1)     NOT NULL DEFAULT 0,
  employee_acknowledgement_date DATE           NULL,

  created_at                    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    DATETIME       NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (review_id),

  CONSTRAINT fk_devreview_profile
    FOREIGN KEY (profile_id)    REFERENCES employee_profiles (profile_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT fk_devreview_reviewer
    FOREIGN KEY (reviewed_by)   REFERENCES users (user_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_devreview_checkpoint
    FOREIGN KEY (checkpoint_id) REFERENCES evaluation_checkpoints (checkpoint_id)
    ON DELETE SET NULL ON UPDATE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Development reviews: work-life balance and professional development assessments';


-- =============================================================================
-- Clean up helper procedures
-- =============================================================================
DROP PROCEDURE IF EXISTS _add_col_if_missing;
DROP PROCEDURE IF EXISTS _add_check_if_missing;


-- =============================================================================
-- Verification queries (run manually to confirm)
-- =============================================================================
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME   = 'self_assessments'
--    AND COLUMN_NAME IN (
--      'onboarding_progress_notes','understands_responsibilities',
--      'received_sufficient_training','has_required_system_access',
--      'areas_needing_support','training_support_requested',
--      'employee_comments','employee_acknowledgement_date'
--    );
--
-- SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME   = 'performance_notes'
--    AND COLUMN_NAME IN (
--      'note_category','kpi_target','kpi_achievement','kpi_rating','employee_response'
--    );
--
-- DESCRIBE development_reviews;
