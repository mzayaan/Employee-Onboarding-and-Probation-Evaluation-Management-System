-- =============================================================================
-- Migration: Spec s.2.3.1 — Extended employee fields
-- Purpose:   Add address block, work details, emergency contact, education,
--            identity/work-permit columns to employee_profiles;
--            middle_name to users; contract_end_date to contracts.
--
-- HOW TO RUN: MySQL Workbench → open your FYP schema
--             File > Open SQL Script > select this file > Execute All (lightning bolt)
--
-- NOTE:  ADD COLUMN requires MySQL < 8.0.4 syntax (no IF NOT EXISTS).
--        Run each section independently if re-running to avoid duplicate-column
--        errors (error 1060 on a column that already exists is harmless — just
--        comment out that line and re-run the rest).
-- =============================================================================

-- Uncomment and set your schema name:
-- USE fyp_onboarding_db;


-- =============================================================================
-- SECTION 1 — users: add middle_name
-- Spec s.2.5 | Display as "First Middle Last" only when present.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN middle_name VARCHAR(100) NULL
      COMMENT 'Optional middle name. Display helper: show only when non-null.'
      AFTER last_name;


-- =============================================================================
-- SECTION 2 — employee_profiles: spec s.2.3.1 — Address block
-- HR Admin collects at registration (spec s.4.4).
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN address_line_1 VARCHAR(255) NULL
      COMMENT 'Primary address line — street/number. HR Admin field.'
      AFTER evaluation_status,

  ADD COLUMN address_line_2 VARCHAR(255) NULL
      COMMENT 'Secondary address line — apartment/suite. Optional.'
      AFTER address_line_1,

  ADD COLUMN locality VARCHAR(100) NULL
      COMMENT 'Town, village or locality name.'
      AFTER address_line_2,

  ADD COLUMN district VARCHAR(100) NULL
      COMMENT 'District or region (e.g. Port Louis, Plaines Wilhems).'
      AFTER locality,

  ADD COLUMN country VARCHAR(100) NOT NULL DEFAULT 'Mauritius'
      COMMENT 'Country of residence. Defaults to Mauritius.'
      AFTER district,

  ADD COLUMN postal_code VARCHAR(10) NULL
      COMMENT 'Postal code — optional in Mauritius addressing.'
      AFTER country;


-- =============================================================================
-- SECTION 3 — employee_profiles: work details
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN weekly_working_hours DECIMAL(4,1) NULL
      COMMENT 'Contracted weekly hours. Required when work_schedule_type = Part-Time (WRA 2019). Must be > 0 and <= 48.'
      AFTER postal_code,

  ADD COLUMN work_location VARCHAR(150) NULL
      COMMENT 'Primary work location or site (e.g. Head Office - Port Louis, Remote). HR Admin field.'
      AFTER weekly_working_hours;


-- =============================================================================
-- SECTION 4 — employee_profiles: personal email (employee self-completes)
-- Spec s.4.4 — Employee onboarding field.
-- Must differ from work email (users.email). DPA 2017-sensitive.
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN personal_email VARCHAR(255) NULL
      COMMENT 'Personal email address — employee self-completes during onboarding. Must differ from work email. DPA 2017-sensitive.'
      AFTER work_location;


-- =============================================================================
-- SECTION 5 — employee_profiles: emergency contact
-- Employee self-completes during onboarding (spec s.4.4).
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN emergency_contact_name VARCHAR(150) NULL
      COMMENT 'Full name of emergency contact. Employee-facing onboarding field.'
      AFTER personal_email,

  ADD COLUMN emergency_contact_relationship VARCHAR(100) NULL
      COMMENT 'Relationship to employee (e.g. Spouse, Parent, Sibling).'
      AFTER emergency_contact_name,

  ADD COLUMN emergency_contact_phone VARCHAR(20) NULL
      COMMENT 'Emergency contact phone number including country code.'
      AFTER emergency_contact_relationship;


-- =============================================================================
-- SECTION 6 — employee_profiles: education & previous employment
-- Employee self-completes during onboarding (spec s.4.4).
-- Note: employment_history_summary (TEXT) already exists from s.2.3 migration.
-- These are structured fields separate from that free-text summary.
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN highest_qualification VARCHAR(100) NULL
      COMMENT 'Highest academic qualification (e.g. BSc, MSc, PhD, Diploma).'
      AFTER emergency_contact_phone,

  ADD COLUMN field_of_study VARCHAR(150) NULL
      COMMENT 'Field or discipline of the highest qualification.'
      AFTER highest_qualification,

  ADD COLUMN educational_institution VARCHAR(200) NULL
      COMMENT 'Institution awarding the highest qualification.'
      AFTER field_of_study,

  ADD COLUMN previous_job_title VARCHAR(150) NULL
      COMMENT 'Most recent job title held before joining. Separate from employment_history_summary (TEXT).'
      AFTER educational_institution;


-- =============================================================================
-- SECTION 7 — employee_profiles: identity document
-- DPA 2017-sensitive. Field-level access control required (spec s.2.3.1).
-- Audit log on every read/write.
-- nic_number already exists (VARCHAR(14) UNIQUE) — this adds the type selector
-- and passport_number for non-citizen employees.
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN id_document_type ENUM('NIC','PASSPORT','RESIDENCE_PERMIT','OTHER') NULL
      COMMENT 'Type of primary identity document. DPA 2017 — field-level access control required. HR Admin field.'
      AFTER previous_job_title,

  ADD COLUMN passport_number VARCHAR(50) NULL
      COMMENT 'Passport number — applies when id_document_type IN (PASSPORT, RESIDENCE_PERMIT). DPA 2017-sensitive. Audit log on every read/write.'
      AFTER id_document_type;

-- Unique index on passport_number (allow multiple NULLs — only one value per employee)
ALTER TABLE employee_profiles
  ADD UNIQUE INDEX uq_employee_profiles_passport_number (passport_number);


-- =============================================================================
-- SECTION 8 — employee_profiles: work authorisation / permit
-- HR Admin field. Triggers 30-day advance-warning notification (spec s.2.3.1).
-- =============================================================================

ALTER TABLE employee_profiles
  ADD COLUMN work_permit_details VARCHAR(500) NULL
      COMMENT 'Work permit or residence permit reference details. HR Admin field.'
      AFTER passport_number,

  ADD COLUMN work_authorisation_expiry DATE NULL
      COMMENT 'Expiry date of work authorisation/permit. Triggers 30-day advance-warning notification. HR Admin field.'
      AFTER work_permit_details;


-- =============================================================================
-- SECTION 9 — contracts: contract_end_date
-- Spec s.2.6 | Conditional — required when contract_type = FIXED_TERM.
-- Triggers 30-day advance-warning notification.
-- =============================================================================

ALTER TABLE contracts
  ADD COLUMN contract_end_date DATE NULL
      COMMENT 'Fixed-term contract end date. Required when contract_type = FIXED_TERM. Triggers 30-day advance-warning notification (spec s.2.6).'
      AFTER signed_at;


-- =============================================================================
-- VERIFICATION QUERIES — uncomment after running
-- =============================================================================

-- Check users new column:
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'middle_name';

-- Check employee_profiles new columns (s.2.3.1):
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_profiles'
-- AND COLUMN_NAME IN (
--   'address_line_1','address_line_2','locality','district','country','postal_code',
--   'weekly_working_hours','work_location','personal_email',
--   'emergency_contact_name','emergency_contact_relationship','emergency_contact_phone',
--   'highest_qualification','field_of_study','educational_institution','previous_job_title',
--   'id_document_type','passport_number','work_permit_details','work_authorisation_expiry'
-- );

-- Check contracts new column:
-- SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'contract_end_date';
