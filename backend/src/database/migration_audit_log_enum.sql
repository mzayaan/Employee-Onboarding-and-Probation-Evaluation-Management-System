-- =============================================================================
-- MIGRATION: Expand audit_logs.action_type ENUM
-- Fixes FR-18 / NFR-08 compliance gap where 11 action types were silently
-- rejected by MySQL because they were missing from the ENUM definition.
-- Run this once against your existing database before the next application start.
-- =============================================================================

ALTER TABLE audit_logs
MODIFY COLUMN action_type ENUM(
    -- Auth
    'USER_CREATED',
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
    'UPDATE_DEPARTMENT'
) NOT NULL COMMENT 'Immutable audit action type. All values used by controllers must appear here.';
