-- =============================================================================
-- Migration: 20261118_g08_audit_log_enum_fix.sql
--
-- G08 (Finding 6 — Schema/event mismatches): the AuditLog model already
-- includes both new G08 action_type values:
--
--   'RECOMMENDATION_RESUBMITTED'              (manager justification-only path)
--   'RECOMMENDATION_REVISED_AND_RESUBMITTED'  (G08 score-correction path)
--
-- However the underlying MySQL ENUM column in the audit_logs table was created
-- by earlier migrations that pre-date G08 and therefore does not include
-- 'RECOMMENDATION_REVISED_AND_RESUBMITTED'.  Any INSERT attempt with that
-- value raises "Data truncated for column 'action_type'".
--
-- This migration extends the ENUM definition on the existing table so that
-- both values are accepted.
--
-- Prerequisites:
--   • audit_logs table exists.
--   • The table is live (this is an ALTER TABLE, not a recreation).
--
-- FR-18 | G08 | NFR-02, NFR-08 | Objective 3
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
    -- Probation approval workflow (Block 5 — 3-stage Director approval)
    'RECOMMENDATION_SUBMITTED',
    'RECOMMENDATION_ENDORSED',
    'RECOMMENDATION_RETURNED_BY_HR',
    'RECOMMENDATION_RESUBMITTED',
    'RECOMMENDATION_REVISED_AND_RESUBMITTED',   -- G08: manager corrects scores then resubmits
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
    -- Contract
    'SIGN_CONTRACT',
    'CREATE_CONTRACT',
    -- HRDC training
    'ADD_HRDC_TRAINING_LOG',
    'DELETE_HRDC_TRAINING_LOG',
    'EXPORT_HRDC_G1',
    -- System config
    'CREATE_SYSTEM_CONFIG',
    'UPDATE_SYSTEM_CONFIG',
    -- Profile image
    'PROFILE_IMAGE_UPDATED',
    'UPDATE_PROFILE_IMAGE',
    -- Employee self-update
    'EMPLOYEE_SELF_UPDATE'
  ) NOT NULL;
