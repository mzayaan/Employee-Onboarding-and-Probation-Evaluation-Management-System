// =============================================================================
// src/models/EmployeeProfile.js
// Table 3: employee_profiles
// FR-04 | Objective 1
//
// Spec s.2.3 additions (non-destructive, all new columns nullable):
//   profile_image_url, date_of_birth, employment_history_summary,
//   salary_scale_tier, next_line_of_promotion, employment_type (ENUM),
//   work_schedule_type (ENUM), evaluation_status (ENUM).
//
// Spec s.2.3.1 additions (all nullable):
//   Address block: address_line_1/2, locality, district, country, postal_code
//   Work details: weekly_working_hours, work_location
//   Personal: personal_email
//   Emergency contact: emergency_contact_name/relationship/phone
//   Education: highest_qualification, field_of_study, educational_institution, previous_job_title
//   Identity: id_document_type, passport_number (DPA 2017 — field-level access control required)
//   Work permit: work_permit_details, work_authorisation_expiry
//
// MIGRATION NOTE: existing employment_status values can be backfilled into
//   evaluation_status in a staged release before switching readers/writers.
//   The employment_status column is retained for backward compatibility.
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EmployeeProfile = sequelize.define('EmployeeProfile', {
  profile_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'FK to users — one profile per employee user',
  },
  department_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to departments',
  },
  manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to users — reporting LINE_MANAGER',
  },
  job_title: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Employment start date',
  },
  probation_end_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Must be after start_date — enforced in service layer',
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female'),
    allowNull: false,
    comment: 'Required for Statistics Mauritius gender-disaggregated headcount reporting',
  },
  nationality: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Employee nationality — relevant for work permit checks in Mauritius context',
  },
  salary_monthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Monthly salary in MUR — used to determine Vacation Leave eligibility per WRA 2019 s.47 (threshold: MUR 50,000/month)',
  },

  // ── Mauritius Identity & Tax Fields ──────────────────────────────────────
  nic_number: {
    type: DataTypes.STRING(14),
    allowNull: true,
    unique: true,
    comment: 'Mauritian National Identity Card number — 14 characters (letter + 13 digits). Validated at route layer by validateNIC middleware.',
  },
  tax_account_number: {
    type: DataTypes.STRING(10),
    allowNull: true,
    unique: true,
    comment: 'MRA Tax Account Number (TAN) — individual tax reporting reference issued by the Mauritius Revenue Authority.',
  },

  // ── Banking Details for Payroll Routing ──────────────────────────────────
  bank_name: {
    type: DataTypes.ENUM('MCB', 'SBM', 'ABSA', 'MAUBANK', 'AfrAsia', 'BCP', 'HSBC'),
    allowNull: true,
    comment: 'Mauritian bank for local ACH/clearing house salary routing.',
  },
  bank_account_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Employee bank account number — stored for payroll purposes only.',
  },

  employment_status: {
    type: DataTypes.ENUM('PROBATION', 'PERMANENT', 'DISMISSED', 'EXTENDED'),
    allowNull: false,
    defaultValue: 'PROBATION',
    comment: 'Retained for backward compatibility. Gradually migrate readers/writers to evaluation_status (see spec s.1.2).',
  },
  onboarding_status: {
    type: DataTypes.ENUM('IN_PROGRESS', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'IN_PROGRESS',
  },

  // ── Spec s.2.3 — New columns (all nullable for non-destructive migration) ──

  profile_image_url: {
    type:      DataTypes.STRING(500),
    allowNull: true,
    comment:   'Cloudinary asset URL for the employee avatar. Stored after MIME/size validation. Never expose the original signed upload URL.',
  },
  date_of_birth: {
    type:      DataTypes.DATEONLY,
    allowNull: true,
    comment:   'Employee date of birth — initially nullable for existing records. Required on newly created profiles after migration. ' +
               'Compute age in the application; do not store a stale age value. DPA 2017-sensitive field.',
  },
  employment_history_summary: {
    type:      DataTypes.TEXT,
    allowNull: true,
    comment:   'Free-text summary of previous workplace history and experience metrics.',
  },
  salary_scale_tier: {
    type:      DataTypes.STRING(50),
    allowNull: true,
    comment:   'Internal salary grade band identifier (e.g. "Band 3", "Grade B"). Reconcile with Contract.basic_salary_mur.',
  },
  next_line_of_promotion: {
    type:      DataTypes.STRING(150),
    allowNull: true,
    comment:   'Text capturing the next clear development path or promotion milestone for this employee.',
  },
  employment_type: {
    type: DataTypes.ENUM(
      'Permanent',
      'Fixed-Term / Contract',
      'Temporary / Agency',
      'Casual',
      'Independent Contractor / Consultant',
    ),
    allowNull: true,
    comment:
      'Contractual category — separate from employment_status and evaluation_status. ' +
      'Reconcile with Contract.contract_type to prevent contradictory values (spec s.1.2).',
  },
  work_schedule_type: {
    type:      DataTypes.ENUM('Full-Time', 'Part-Time'),
    allowNull: true,
    comment:   'Working arrangement type. Stored separately from contractual category to prevent mixing (spec s.1.2).',
  },
  evaluation_status: {
    type:      DataTypes.ENUM('PROBATION', 'PERMANENT', 'EXTENDED', 'DISMISSED'),
    allowNull: true,
    comment:
      'Isolated probationary tracking state. ' +
      'Target: backfill from employment_status, then switch all controllers/reporting to this field. ' +
      'employment_status retained until regression tests pass (spec s.1.2).',
  },

  // ── Spec s.2.3.1 — Address block (HR Admin collects at registration) ─────────
  address_line_1: {
    type:      DataTypes.STRING(255),
    allowNull: true,
    comment:   'Primary address line — street number and name. HR Admin registration field.',
  },
  address_line_2: {
    type:      DataTypes.STRING(255),
    allowNull: true,
    comment:   'Secondary address line — apartment, suite, floor. Optional.',
  },
  locality: {
    type:      DataTypes.STRING(100),
    allowNull: true,
    comment:   'Town, village or locality name.',
  },
  district: {
    type:      DataTypes.STRING(100),
    allowNull: true,
    comment:   'District or region (e.g. Port Louis, Plaines Wilhems, Rivière du Rempart).',
  },
  country: {
    type:         DataTypes.STRING(100),
    allowNull:    false,
    defaultValue: 'Mauritius',
    comment:      'Country of residence. Defaults to Mauritius.',
  },
  postal_code: {
    type:      DataTypes.STRING(10),
    allowNull: true,
    comment:   'Postal code — optional in Mauritius addressing.',
  },

  // ── Spec s.2.3.1 — Work details (HR Admin collects at registration) ──────────
  weekly_working_hours: {
    type:      DataTypes.DECIMAL(4, 1),
    allowNull: true,
    comment:   'Contracted weekly hours. Required when work_schedule_type = Part-Time (WRA 2019). Must be > 0 and <= 48. Validated in service layer.',
  },
  work_location: {
    type:      DataTypes.STRING(150),
    allowNull: true,
    comment:   'Primary work location or site (e.g. Head Office - Port Louis, Remote). HR Admin registration field.',
  },

  // ── Spec s.2.3.1 — Personal email (employee self-completes during onboarding) ─
  personal_email: {
    type:      DataTypes.STRING(255),
    allowNull: true,
    unique:    true,
    validate:  { isEmail: true },
    comment:   'Personal email address — employee self-completes during onboarding. Must differ from work email (users.email). DPA 2017-sensitive.',
  },

  // ── Spec s.2.3.1 — Emergency contact (employee self-completes) ───────────────
  emergency_contact_name: {
    type:      DataTypes.STRING(150),
    allowNull: true,
    comment:   'Full name of emergency contact. Employee-facing onboarding field.',
  },
  emergency_contact_relationship: {
    type:      DataTypes.STRING(100),
    allowNull: true,
    comment:   'Relationship to employee (e.g. Spouse, Parent, Sibling).',
  },
  emergency_contact_phone: {
    type:      DataTypes.STRING(20),
    allowNull: true,
    comment:   'Emergency contact phone number including country code.',
  },

  // ── Spec s.2.3.1 — Education & previous employment (employee self-completes) ─
  highest_qualification: {
    type:      DataTypes.STRING(100),
    allowNull: true,
    comment:   'Highest academic qualification held (e.g. BSc, MSc, PhD, Diploma, Certificate).',
  },
  field_of_study: {
    type:      DataTypes.STRING(150),
    allowNull: true,
    comment:   'Field or discipline of the highest qualification.',
  },
  educational_institution: {
    type:      DataTypes.STRING(200),
    allowNull: true,
    comment:   'Institution awarding the highest qualification.',
  },
  previous_job_title: {
    type:      DataTypes.STRING(150),
    allowNull: true,
    comment:   'Most recent job title held before joining. Structured field — separate from employment_history_summary (TEXT).',
  },
  previous_company_name: {
    type:      DataTypes.STRING(200),
    allowNull: true,
    comment:   'Name of most recent employer before joining. HR Admin registration field.',
  },
  previous_salary_monthly: {
    type:      DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment:   'Monthly salary at previous employer (MUR). Used for benchmarking and offer context. HR Admin registration field.',
  },
  reporting_notes: {
    type:      DataTypes.STRING(500),
    allowNull: true,
    comment:   'Additional notes on reporting structure or responsibilities beyond the assigned line manager.',
  },

  // ── Spec s.2.3.1 — Identity document (DPA 2017 — field-level access control) ─
  id_document_type: {
    type:      DataTypes.ENUM('NIC', 'PASSPORT', 'RESIDENCE_PERMIT', 'OTHER'),
    allowNull: true,
    comment:   'Type of primary identity document presented. DPA 2017-sensitive. HR Admin registration field. Audit log on every read/write.',
  },
  passport_number: {
    type:      DataTypes.STRING(50),
    allowNull: true,
    unique:    true,
    comment:   'Passport number — applies when id_document_type IN (PASSPORT, RESIDENCE_PERMIT). DPA 2017-sensitive. Audit log on every read/write.',
  },

  // ── Spec s.2.3.1 — Work authorisation / permit (HR Admin field) ──────────────
  work_permit_details: {
    type:      DataTypes.STRING(500),
    allowNull: true,
    comment:   'Work permit or residence permit reference details. HR Admin registration field.',
  },
  work_authorisation_expiry: {
    type:      DataTypes.DATEONLY,
    allowNull: true,
    comment:   'Expiry date of work authorisation or permit. Triggers 30-day advance-warning notification (spec s.2.3.1).',
  },

  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'employee_profiles',
  timestamps: false,
});

module.exports = EmployeeProfile;
