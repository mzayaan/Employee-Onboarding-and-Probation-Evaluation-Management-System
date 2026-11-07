-- =============================================================================
-- Migration: Spec s.2.3 EmployeeProfile extensions + system_configs table
-- Purpose:   The EmployeeProfile Sequelize model was extended with new columns
--            (profile_image_url, date_of_birth, employment_history_summary, etc.)
--            and a new SystemConfig model was added.  These columns/table do not
--            yet exist in MySQL, causing Sequelize to generate SELECT statements
--            with unknown column names → 500 Internal Server Error on every
--            EmployeeProfile query (including /api/auth/me and
--            /api/dashboard/onboarding-progress).
--
-- HOW TO RUN: Open MySQL Workbench → open your FYP schema →
--             File > Open SQL Script > select this file > Execute All (lightning bolt)
--             OR paste each section into the query editor and run section by section.
--
-- NOTE:      ADD COLUMN IF NOT EXISTS requires MySQL 8.0.4+.  This version uses
--            plain ADD COLUMN instead — it is safe because these columns do not
--            yet exist (their absence is what causes the 500 errors).
--            If you need to re-run this script, comment out the ALTER TABLE block
--            or drop/recreate in a dev environment.
-- =============================================================================

-- Make sure you are in the correct schema before running.
-- Uncomment and replace with your actual schema name:
-- USE fyp_onboarding_db;


-- =============================================================================
-- SECTION 1: employee_profiles — Spec s.2.3 new columns
--
-- These columns were added to EmployeeProfile.js but do not yet exist in MySQL.
-- Sequelize generates an explicit SELECT for every model-defined column,
-- so they MUST exist in the actual table.
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN profile_image_url         VARCHAR(500)   NULL
      COMMENT 'Cloudinary asset URL for the employee avatar.'
      AFTER onboarding_status,

  ADD COLUMN date_of_birth             DATE           NULL
      COMMENT 'Employee date of birth. DPA 2017-sensitive. Compute age in application layer.'
      AFTER profile_image_url,

  ADD COLUMN employment_history_summary TEXT           NULL
      COMMENT 'Free-text summary of previous workplace history and experience metrics.'
      AFTER date_of_birth,

  ADD COLUMN salary_scale_tier         VARCHAR(50)    NULL
      COMMENT 'Internal salary grade band identifier.'
      AFTER employment_history_summary,

  ADD COLUMN next_line_of_promotion    VARCHAR(150)   NULL
      COMMENT 'Next clear development path or promotion milestone for this employee.'
      AFTER salary_scale_tier,

  ADD COLUMN employment_type
      ENUM(
        'Permanent',
        'Fixed-Term / Contract',
        'Temporary / Agency',
        'Casual',
        'Independent Contractor / Consultant'
      ) NULL
      COMMENT 'Contractual category — separate from employment_status and evaluation_status.'
      AFTER next_line_of_promotion,

  ADD COLUMN work_schedule_type
      ENUM('Full-Time', 'Part-Time') NULL
      COMMENT 'Working arrangement type. Stored separately from contractual category.'
      AFTER employment_type,

  ADD COLUMN evaluation_status
      ENUM('PROBATION', 'PERMANENT', 'EXTENDED', 'DISMISSED') NULL
      COMMENT 'Isolated probationary tracking state. Target: backfill from employment_status.'
      AFTER work_schedule_type;


-- =============================================================================
-- SECTION 2: system_configs — new table (append-only minimum salary history)
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_configs (
  config_id      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  min_salary_mur DECIMAL(10, 2)  NOT NULL
                 COMMENT 'Statutory minimum monthly salary in MUR. Reference baseline: Rs 17,745.00 for 2026. Verify against National Remuneration Board orders before production use.',
  effective_date DATE            NOT NULL
                 COMMENT 'Date from which this minimum salary figure became legally effective. Create a new row for each legislative update; never modify or delete historical rows.',
  updated_by     INT             NULL
                 COMMENT 'FK to users.user_id — the SYSTEM_ADMIN who created this row.',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NULL,

  PRIMARY KEY (config_id),
  CONSTRAINT fk_system_configs_updated_by
    FOREIGN KEY (updated_by) REFERENCES users (user_id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'Append-only history of statutory minimum salary baselines. Never delete historical rows.';


-- =============================================================================
-- SECTION 3: Seed initial system_configs row
-- Only inserts if the table is empty — safe to run repeatedly.
-- =============================================================================

INSERT INTO system_configs (min_salary_mur, effective_date, updated_by, created_at)
SELECT 17745.00, '2026-01-01', NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM system_configs LIMIT 1);


-- =============================================================================
-- VERIFICATION QUERIES — uncomment and run after the migration to confirm
-- =============================================================================

-- Check the 8 new employee_profiles columns:
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME   = 'employee_profiles'
--   AND COLUMN_NAME IN (
--     'profile_image_url', 'date_of_birth', 'employment_history_summary',
--     'salary_scale_tier', 'next_line_of_promotion', 'employment_type',
--     'work_schedule_type', 'evaluation_status'
--   );

-- Check system_configs table and seed row:
-- SELECT * FROM system_configs;
