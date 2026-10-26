-- =============================================================================
-- mauritius_compliance_migration.sql
-- Mauritius Compliance Feature Migration
--
-- Run this script in MySQL Workbench against the active project database
-- before starting the backend server with the new compliance code.
--
-- NOTE: Standard MySQL does NOT support ADD COLUMN IF NOT EXISTS.
--       This script uses plain ADD COLUMN — run it ONCE on a clean database.
--       If you need to re-run after a partial failure, skip any ALTER/CREATE
--       statements whose columns/tables already exist.
--
-- Implements:
--   1. New columns on employee_profiles  (NIC, TAN, bank, salary)
--   2. New columns on leave_balances     (maternity / paternity entitlements)
--   3. New table: contracts              (WRA 2019 s.13 probation rules)
--   4. New table: hrdc_training_logs     (HRDC levy refund tracking)
--   5. New table: tax_declarations       (MRA Employee Declaration Form)
--
-- FR-04 (extended) | FR-NEW-01 | FR-NEW-02 | NFR-08
-- WRA 2019 s.13, s.46, s.47, s.48, s.49 | MRA EDF | HRDC G1
-- =============================================================================

USE onboarding_probation_db;

-- =============================================================================
-- 1. ALTER TABLE employee_profiles
--    Add Mauritius identity, tax, banking and salary fields.
-- =============================================================================

-- NOTE: salary_monthly already exists in employee_profiles from the original schema.
--       Only the 4 Mauritius compliance columns are added here.
ALTER TABLE employee_profiles
  ADD COLUMN nic_number VARCHAR(14) NULL UNIQUE
    COMMENT 'Mauritian National Identity Card number — 14 chars (letter + 13 digits)',
  ADD COLUMN tax_account_number VARCHAR(10) NULL UNIQUE
    COMMENT 'MRA Tax Account Number (TAN) — individual tax reference',
  ADD COLUMN bank_name ENUM('MCB','SBM','ABSA','MAUBANK','AfrAsia','BCP','HSBC') NULL
    COMMENT 'Mauritian bank for local salary routing',
  ADD COLUMN bank_account_number VARCHAR(50) NULL
    COMMENT 'Employee bank account number for payroll';

-- =============================================================================
-- 2. ALTER TABLE leave_balances
--    Add maternity and paternity entitlement counters.
--    WRA 2019 s.48: 70 working days maternity leave.
--    WRA 2019 s.49: 5 continuous working days paternity leave.
-- =============================================================================

ALTER TABLE leave_balances
  ADD COLUMN maternity_leave_entitled INT NOT NULL DEFAULT 70
    COMMENT 'WRA 2019 s.48: 14 weeks = 70 working days fully paid maternity leave',
  ADD COLUMN paternity_leave_entitled INT NOT NULL DEFAULT 5
    COMMENT 'WRA 2019 s.49: 5 continuous working days paid paternity leave';

-- =============================================================================
-- 3. CREATE TABLE contracts
--    One employment contract record per employee.
--    Stores contract type, probation clause (WRA 2019 s.13), salary and
--    digital signature status.
-- =============================================================================

CREATE TABLE IF NOT EXISTS contracts (
  contract_id               INT            NOT NULL AUTO_INCREMENT,
  profile_id                INT            NOT NULL UNIQUE
    COMMENT 'FK to employee_profiles — one contract per employee',
  contract_reference        VARCHAR(100)   NULL UNIQUE
    COMMENT 'Internal contract reference, e.g. CORP/2026/042',
  contract_type             ENUM('INDETERMINATE','PART_TIME','FIXED_TERM') NOT NULL
    COMMENT 'INDETERMINATE = permanent open-ended; FIXED_TERM = specified end date',
  probation_duration_months INT            NOT NULL DEFAULT 3
    COMMENT 'Configured probation length in months — max 6 per WRA 2019 s.13',
  probation_clause_included TINYINT(1)     NOT NULL DEFAULT 1
    COMMENT '0 = no probation clause, employee is PERMANENT from day one',
  basic_salary_mur          DECIMAL(10,2)  NOT NULL
    COMMENT 'Gross basic monthly salary in MUR as stated in the contract',
  notice_period_days        INT            NOT NULL DEFAULT 14
    COMMENT 'Contractual notice period in calendar days',
  signed_at                 DATE           NULL
    COMMENT 'Date employee signed the contract — NULL until signed',
  cloudinary_url            VARCHAR(500)   NULL
    COMMENT 'Cloudinary URL of the signed contract PDF if uploaded',
  created_at                DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME       NULL,
  PRIMARY KEY (contract_id),
  CONSTRAINT fk_contracts_profile
    FOREIGN KEY (profile_id) REFERENCES employee_profiles (profile_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Employment contract records — WRA 2019 s.13 probation compliance';

-- =============================================================================
-- 4. CREATE TABLE hrdc_training_logs
--    Tracks training for HRDC Training Levy refund claims (G1 form).
-- =============================================================================

CREATE TABLE IF NOT EXISTS hrdc_training_logs (
  training_id               INT            NOT NULL AUTO_INCREMENT,
  profile_id                INT            NOT NULL
    COMMENT 'FK to employee_profiles — employee who attended the training',
  course_name               VARCHAR(255)   NOT NULL
    COMMENT 'Full name of the training course or programme',
  training_provider         VARCHAR(255)   NOT NULL DEFAULT 'Internal'
    COMMENT 'Training provider name — "Internal" for in-house delivery',
  hrdc_approved_course_code VARCHAR(50)    NULL
    COMMENT 'MQA/HRDC course approval code — required for external refund claims',
  training_cost             DECIMAL(10,2)  NOT NULL DEFAULT 0.00
    COMMENT 'Total cost of training in MUR for HRDC G1 claim calculations',
  duration_hours            INT            NOT NULL
    COMMENT 'Total training duration in hours',
  completed_date            DATE           NOT NULL
    COMMENT 'Date the employee completed the training',
  created_at                DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (training_id),
  CONSTRAINT fk_hrdc_training_profile
    FOREIGN KEY (profile_id) REFERENCES employee_profiles (profile_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='HRDC training levy logs for G1 refund claim preparation';

-- =============================================================================
-- 5. CREATE TABLE tax_declarations
--    Stores the MRA Employee Declaration Form (EDF) submission.
--    One row per employee (UNIQUE on profile_id — replaced on resubmission).
-- =============================================================================

CREATE TABLE IF NOT EXISTS tax_declarations (
  declaration_id       INT      NOT NULL AUTO_INCREMENT,
  profile_id           INT      NOT NULL UNIQUE
    COMMENT 'FK to employee_profiles — one active declaration per employee',
  declaration_category ENUM('A','B','C','D','E','F','G') NOT NULL
    COMMENT 'MRA EDF category — determines additional personal exemption for PAYE',
  num_dependants       INT      NOT NULL DEFAULT 0
    COMMENT 'Number of declared dependent children',
  spouse_employed      TINYINT(1) NOT NULL DEFAULT 1
    COMMENT '1 = spouse employed or has independent income',
  declaration_date     DATE     NOT NULL
    COMMENT 'Date the employee signed and submitted this declaration',
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NULL,
  PRIMARY KEY (declaration_id),
  CONSTRAINT fk_tax_declarations_profile
    FOREIGN KEY (profile_id) REFERENCES employee_profiles (profile_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='MRA Employee Declaration Form (EDF) — PAYE category declarations';

-- =============================================================================
-- Verification queries — run after migration to confirm all objects exist.
-- =============================================================================

-- Check new columns on employee_profiles
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'employee_profiles'
  AND COLUMN_NAME IN ('nic_number','tax_account_number','bank_name','bank_account_number','salary_monthly')
ORDER BY COLUMN_NAME;

-- Check new columns on leave_balances
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME   = 'leave_balances'
  AND COLUMN_NAME IN ('maternity_leave_entitled','paternity_leave_entitled')
ORDER BY COLUMN_NAME;

-- Check new tables
SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('contracts','hrdc_training_logs','tax_declarations');
