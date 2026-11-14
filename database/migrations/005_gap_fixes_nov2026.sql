-- =============================================================================
-- Migration 005 — Gap Fixes (November 2026)
-- Employee Onboarding and Probation Evaluation Management System
--
-- Covers G02, G03, G05, G07, G09, G11A, G11B implementation requirements:
--
--   G05  audit_logs.action_type ENUM expanded with 10 missing values.
--   G11A users.token_version column added for JWT invalidation on
--        password change / reset.
--   G09  evaluation_scores.weight_percent_at_scoring column added to
--        preserve the criterion weight used at the time of submission.
--
-- G01, G02, G03, G07, G11B are pure application-layer fixes that require
-- no schema change.
--
-- Compatible with MySQL 5.7+ and MySQL 8.x.
-- Uses INFORMATION_SCHEMA-based procedures to remain idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper procedure: adds a column only when it does not already exist.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS _add_col_if_missing;

DELIMITER $$
CREATE PROCEDURE _add_col_if_missing(
  IN p_table  VARCHAR(64),
  IN p_col    VARCHAR(64),
  IN p_def    TEXT
)
BEGIN
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


-- =============================================================================
-- G11A — users.token_version
-- Incremented on password change / reset so that tokens issued before the
-- change are rejected by the authenticate middleware.
-- =============================================================================

CALL _add_col_if_missing(
  'users',
  'token_version',
  'INT NOT NULL DEFAULT 0'
);


-- =============================================================================
-- G09 — evaluation_scores.weight_percent_at_scoring
-- Snapshot of EvaluationCriterion.weight_percent at the time of submission.
-- Preserves the historical breakdown even if criteria weights are later
-- reconfigured.
-- =============================================================================

CALL _add_col_if_missing(
  'evaluation_scores',
  'weight_percent_at_scoring',
  'DECIMAL(5,2) NULL'
);


-- =============================================================================
-- G05 — audit_logs.action_type ENUM expansion
--
-- MySQL does not support IF NOT EXISTS for MODIFY COLUMN, so we always reissue
-- the MODIFY with the full, up-to-date ENUM list.  MySQL treats it as a no-op
-- if the definition is already identical, so the statement is safe to re-run.
-- =============================================================================

ALTER TABLE `audit_logs`
  MODIFY COLUMN `action_type` ENUM(
    -- Auth
    'USER_CREATED',
    'USER_ACTIVATED',
    'USER_DEACTIVATED',
    'LOGIN',
    'LOGIN_FAILED',
    'LOGOUT',
    'PASSWORD_RESET',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_COMPLETED',
    'PASSWORD_CHANGED',
    -- Employee
    'EMPLOYEE_CREATED',
    'EMPLOYEE_UPDATED',
    -- Documents
    'DOCUMENT_UPLOAD',
    'DOCUMENT_APPROVED',
    'DOCUMENT_REJECTED',
    -- Tasks
    'TASK_ASSIGNED',
    'TASK_STATUS_UPDATED',
    'TASK_COMPLETED',
    'TASK_DELETED',
    -- Evaluation
    'EVALUATION_SUBMITTED',
    'SELF_ASSESSMENT_SUBMITTED',
    'RECOMMENDATION_GENERATED',
    -- Probation approval workflow (3-stage Director approval)
    'RECOMMENDATION_SUBMITTED',
    'RECOMMENDATION_ENDORSED',
    'RECOMMENDATION_RETURNED_BY_HR',
    'RECOMMENDATION_RESUBMITTED',
    'RECOMMENDATION_APPROVED',
    'RECOMMENDATION_RETURNED_BY_DIRECTOR',
    -- Reports
    'PDF_GENERATED',
    'REPORT_GENERATED',
    -- Criteria
    'CRITERIA_UPDATED',
    'CRITERIA_CREATED',
    'CRITERIA_DEACTIVATED',
    -- Probation
    'PROBATION_PERIOD_CREATED',
    'PROBATION_STATUS_CHANGED',
    -- Attendance
    'ATTENDANCE_RECORDED',
    -- Department
    'CREATE_DEPARTMENT',
    'UPDATE_DEPARTMENT',
    'DEPARTMENT_MANAGER_ASSIGNED',
    'DEPARTMENT_MANAGER_REMOVED',
    -- Development reviews
    'DEVELOPMENT_REVIEW_CREATED',
    'DEVELOPMENT_REVIEW_UPDATED',
    'DEVELOPMENT_REVIEW_ACKNOWLEDGED',
    'DEVELOPMENT_REVIEW_DELETED',
    -- Tax declaration
    'SUBMIT_TAX_DECLARATION',
    -- Contract (G05 addition)
    'SIGN_CONTRACT',
    'CREATE_CONTRACT',
    -- HRDC training (G05 addition)
    'ADD_HRDC_TRAINING_LOG',
    'DELETE_HRDC_TRAINING_LOG',
    'EXPORT_HRDC_G1',
    -- System config (G05 addition)
    'CREATE_SYSTEM_CONFIG',
    'UPDATE_SYSTEM_CONFIG',
    -- Profile image (G05 addition — two controllers use different strings)
    'PROFILE_IMAGE_UPDATED',
    'UPDATE_PROFILE_IMAGE',
    -- Employee self-update (G05 addition)
    'EMPLOYEE_SELF_UPDATE'
  ) NOT NULL;


-- =============================================================================
-- G45/G47 — self_assessment_scores.weight_percent_at_scoring
-- Mirrors evaluation_scores.weight_percent_at_scoring so that self-assessment
-- weighted contributions can be reproduced if criteria weights change later.
-- =============================================================================

CALL _add_col_if_missing(
  'self_assessment_scores',
  'weight_percent_at_scoring',
  'DECIMAL(5,2) NULL AFTER `raw_score`'
);


-- =============================================================================
-- G47 — notifications.type ENUM expansion
--
-- Four new notification types used by controllers:
--   EMPLOYEE_ASSIGNED          — manager notified when HR assigns an employee
--   SELF_ASSESSMENT_SUBMITTED  — HR/manager notified on employee self-assessment
--   PERFORMANCE_NOTE_ADDED     — employee notified on a new performance note
--   PERFORMANCE_NOTE_RESPONDED — manager notified when employee responds to a note
--
-- Uses unconditional MODIFY COLUMN (same idempotent pattern as audit_logs above).
-- =============================================================================

ALTER TABLE `notifications`
  MODIFY COLUMN `type` ENUM(
    -- Onboarding — document lifecycle
    'DOCUMENT_PENDING',
    'DOCUMENT_APPROVED',
    'DOCUMENT_REJECTED',
    -- Onboarding — tasks
    'TASK_ASSIGNED',
    'TASK_OVERDUE',
    -- Evaluation — checkpoint reminders
    'EVAL_DUE',
    'EVAL_OVERDUE',
    -- Account
    'ACCOUNT_CREATED',
    -- Reporting
    'PDF_GENERATED',
    -- Probation period
    'PROBATION_COMPLETE',
    -- Probation approval workflow (3-stage Director approval)
    'RECOMMENDATION_PENDING',
    'RECOMMENDATION_RETURNED',
    'RECOMMENDATION_APPROVED',
    -- Probation outcome (employee notification on Director final decision)
    'PROBATION_OUTCOME',
    -- Development reviews
    'DEVELOPMENT_REVIEW_CREATED',
    'DEVELOPMENT_REVIEW_ACKNOWLEDGED',
    -- Additional workflow events (G47)
    'EMPLOYEE_ASSIGNED',
    'SELF_ASSESSMENT_SUBMITTED',
    'PERFORMANCE_NOTE_ADDED',
    'PERFORMANCE_NOTE_RESPONDED'
  ) NOT NULL;


-- =============================================================================
-- Clean up helper procedures
-- =============================================================================
DROP PROCEDURE IF EXISTS _add_col_if_missing;


-- =============================================================================
-- Verification queries (run manually to confirm)
-- =============================================================================
-- SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME   = 'users'
--    AND COLUMN_NAME  = 'token_version';
--
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME   = 'evaluation_scores'
--    AND COLUMN_NAME  = 'weight_percent_at_scoring';
--
-- SELECT COLUMN_TYPE
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME   = 'audit_logs'
--    AND COLUMN_NAME  = 'action_type';
--
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME   = 'self_assessment_scores'
--    AND COLUMN_NAME  = 'weight_percent_at_scoring';
--
-- SELECT COLUMN_TYPE
--   FROM information_schema.COLUMNS
--  WHERE TABLE_SCHEMA = DATABASE()
--    AND TABLE_NAME   = 'notifications'
--    AND COLUMN_NAME  = 'type';
