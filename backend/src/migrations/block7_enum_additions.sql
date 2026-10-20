-- =============================================================================
-- block7_enum_additions.sql
-- Block 7 — ENUM additions for Notification and AuditLog models.
--
-- WHY THIS FILE EXISTS
-- The project uses sequelize.authenticate() only (no sequelize.sync()).
-- MySQL ENUM columns must be altered with raw SQL; Sequelize model changes
-- alone do NOT modify the database schema.
--
-- HOW TO RUN
-- Open MySQL Workbench → connect to your development database →
-- open this file → execute the full script (Ctrl+Shift+Enter or
-- Query → Execute All Statements).
--
-- SAFE TO RUN MULTIPLE TIMES?  Yes.
-- Each ALTER TABLE statement lists the COMPLETE new ENUM definition,
-- so running it a second time simply sets the column to the same values.
-- No data is lost or corrupted on re-execution.
--
-- ORDERING
-- Run this script BEFORE starting the Node.js backend with Block 5–6 code,
-- because directorController.js writes RECOMMENDATION_SUBMITTED etc. at
-- runtime and MySQL will reject inserts for values not yet in the ENUM.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. notifications.type
--    Adds:  RECOMMENDATION_PENDING | RECOMMENDATION_RETURNED | RECOMMENDATION_APPROVED
-- ---------------------------------------------------------------------------
ALTER TABLE notifications
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
    -- Probation approval workflow (Block 5 — 3-stage Director approval)
    'RECOMMENDATION_PENDING',
    'RECOMMENDATION_RETURNED',
    'RECOMMENDATION_APPROVED'
  ) NOT NULL;


-- ---------------------------------------------------------------------------
-- 2. audit_logs.action_type
--    Adds:  RECOMMENDATION_SUBMITTED | RECOMMENDATION_ENDORSED |
--           RECOMMENDATION_RETURNED_BY_HR | RECOMMENDATION_RESUBMITTED |
--           RECOMMENDATION_APPROVED | RECOMMENDATION_RETURNED_BY_DIRECTOR |
--           DEPARTMENT_MANAGER_ASSIGNED | DEPARTMENT_MANAGER_REMOVED
-- ---------------------------------------------------------------------------
ALTER TABLE audit_logs
  MODIFY COLUMN `action_type` ENUM(
    -- Auth
    'USER_CREATED',
    'USER_ACTIVATED',
    'USER_DEACTIVATED',
    'LOGIN',
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
    -- Probation approval workflow (Block 5 — 3-stage Director approval)
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
    'DEPARTMENT_MANAGER_REMOVED'
  ) NOT NULL;
