// =============================================================================
// src/controllers/employeeController.js
// Employee profile management — create, list, get, update, toggle status
// FR-01, FR-04, FR-21 | NFR-02, NFR-03 | Objective 1
// Updated: accepts gender/nationality/salary_monthly; auto-creates LeaveBalance;
//          adds DIRECTOR to allowedRoles; adds onboarding completion helper
// =============================================================================

const bcrypt    = require('bcrypt');
const { Readable } = require('stream');
const cloudinaryPkg = require('cloudinary').v2;
const { sequelize, User, EmployeeProfile, Department, ProbationPeriod, EvaluationCheckpoint, LeaveBalance, OnboardingDocument, TaskAssignment, DocumentType } = require('../models');
const { Op } = require('sequelize');
const { createAuditLog }                                    = require('../utils/auditLogger');
const { validatePasswordStrength }                          = require('../utils/passwordValidator');
const { sendWelcomeEmail, sendManagerAssignmentEmail }      = require('../utils/mailer');
const { generateSecurePassword }                            = require('../utils/generatePassword');

// =============================================================================
// HELPER: addCalendarMonths
// Adds a specified number of calendar months to a date string "YYYY-MM-DD".
// Handles month-end overflow (e.g. Jan 31 + 1 month → Feb 28/29).
// Spec s.1.4 — calendar-month arithmetic for checkpoint scheduling.
// =============================================================================
function addCalendarMonths(baseDateStr, months) {
  const [year, monthNum, day] = baseDateStr.split('-').map(Number);
  const totalMonths = (monthNum - 1) + months; // 0-based month
  const targetYear  = year + Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12; // 0-based

  const daysInTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay    = Math.min(day, daysInTarget);

  const yyyy = String(targetYear);
  const mm   = String(targetMonth + 1).padStart(2, '0');
  const dd   = String(targetDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Checkpoint month-offset matrix for each permitted probation duration.
// Source: Spec s.1.4 — proposed company evaluation policy.
const CHECKPOINT_MATRIX = {
  1:  [1],
  2:  [1, 2],
  3:  [1, 2, 3],
  6:  [2, 4, 6],
  12: [3, 6, 9, 12],
};

// =============================================================================
// HELPER: buildLeaveBalance
// Creates a LeaveBalance record for the given profile and calendar year.
// Called inside the create-employee transaction for new employees.
// WRA 2019: Annual Leave s.45, Sick Leave s.46, Vacation Leave s.47
// =============================================================================
const buildLeaveBalance = (profileId, year, salaryMonthly) => {
  const VACATION_SALARY_THRESHOLD = 50000; // MUR — WRA 2019 s.47
  const vacationEligible = salaryMonthly != null && Number.parseFloat(salaryMonthly) <= VACATION_SALARY_THRESHOLD;

  return {
    profile_id:              profileId,
    year,
    annual_leave_entitled:   22.0,   // WRA 2019 s.45
    annual_leave_used:       0.0,
    sick_leave_entitled:     15.0,   // WRA 2019 s.46
    sick_leave_used:         0.0,
    sick_leave_accumulated:  0.0,
    vacation_leave_eligible: vacationEligible,
    vacation_leave_entitled: vacationEligible ? 6.0 : 0.0, // 30 days / 5 years = 6/year
    vacation_leave_used:     0.0,
  };
};

// =============================================================================
// HELPER: checkOnboardingCompletion
// Checks whether ALL required documents are approved AND all tasks are completed
// for a given profile. If so, sets onboarding_status = 'COMPLETED'.
// Called after document verification and task completion updates.
// Returns true if status was just set to COMPLETED, false otherwise.
// =============================================================================
const checkOnboardingCompletion = async (profileId, transaction = null) => {
  try {
    const opts = transaction ? { transaction } : {};

    // All submitted documents must be APPROVED (none PENDING or REJECTED)
    const pendingOrRejected = await OnboardingDocument.count({
      where: { profile_id: profileId, status: ['PENDING', 'REJECTED'] },
      ...opts,
    });
    if (pendingOrRejected > 0) return false;

    // There must be at least one approved document (guard against new employee with no docs yet)
    const approvedCount = await OnboardingDocument.count({
      where: { profile_id: profileId, status: 'APPROVED' },
      ...opts,
    });
    if (approvedCount === 0) return false;

    // G01-FIX: Every required document type must have at least one APPROVED submission.
    // Without this check an employee could skip a required document type entirely and
    // still be marked as onboarding-complete as long as they had no PENDING/REJECTED docs.
    const requiredTypes = await DocumentType.findAll({
      where: { is_required: true },
      attributes: ['type_id'],
      ...opts,
    });

    for (const docType of requiredTypes) {
      const approvedForType = await OnboardingDocument.count({
        where: {
          profile_id:       profileId,
          document_type_id: docType.type_id,
          status:           'APPROVED',
        },
        ...opts,
      });
      if (approvedForType === 0) return false;
    }

    // All assigned tasks must be COMPLETED (model ENUM: 'TODO', 'IN_PROGRESS', 'COMPLETED')
    const incompleteTasks = await TaskAssignment.count({
      where: { profile_id: profileId, status: ['TODO', 'IN_PROGRESS'] },
      ...opts,
    });
    if (incompleteTasks > 0) return false;

    // All conditions met — mark onboarding as completed
    await EmployeeProfile.update(
      { onboarding_status: 'COMPLETED', updated_at: new Date() },
      { where: { profile_id: profileId }, ...opts }
    );

    return true;
  } catch (err) {
    console.error('[checkOnboardingCompletion] Error:', err.message);
    return false;
  }
};

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// POST /api/employees
// HR creates a new user account + employee profile + probation period atomically.
// FR-01, FR-04, FR-21 | NFR-02, NFR-03
// =============================================================================
const createEmployee = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const {
      // User account fields
      email,
      password,                    // Optional — auto-generated if absent (spec s.3.2)
      role,
      first_name,
      middle_name,                 // Spec s.2.5 — optional middle name
      last_name,
      // Profile fields
      job_title,
      department_id,
      manager_id,
      phone,
      start_date,
      probation_end_date,          // Explicit override — OR calculated from probation_duration_months
      // Block 3 — FR-21 / lecturer requirements
      gender,                      // REQUIRED for NEW_EMPLOYEE: 'Male' | 'Female'
      nationality,                 // Optional: string
      salary_monthly,              // Optional: MUR — Vacation Leave threshold (WRA 2019 s.47)
      // Spec s.1.4 — calendar-month checkpoint duration (1 | 2 | 3 | 6 | 12)
      // If provided, overrides checkpoint_days and auto-calculates probation_end_date.
      probation_duration_months,
      // Legacy: custom day-offset schedule — kept for backward compatibility.
      // Ignored when probation_duration_months is provided.
      checkpoint_days,
      // Spec s.2.3 — new profile fields (all optional)
      date_of_birth,
      employment_type,
      work_schedule_type,
      weekly_working_hours,
      work_location,
      evaluation_status,
      employment_history_summary,
      salary_scale_tier,
      next_line_of_promotion,
      profile_image_url,
      identity_type,               // 'NIC' (default) or alternative ID document type
      // Spec s.2.3.1 — extended profile fields
      address_line_1,
      address_line_2,
      locality,
      district,
      country,
      postal_code,
      id_document_type,
      nic_number,
      passport_number,
      work_permit_details,
      work_authorisation_expiry,
      contract_end_date,
      personal_email,
      // Emergency contact
      emergency_contact_name,
      emergency_contact_relationship,
      emergency_contact_phone,
      // Education & previous employment
      highest_qualification,
      field_of_study,
      educational_institution,
      previous_job_title,
      previous_company_name,
      previous_salary_monthly,
      reporting_notes,
    } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    const missing = [];
    if (!email)      missing.push('email');
    if (!password)   missing.push('password');
    if (!role)       missing.push('role');
    if (!first_name) missing.push('first_name');
    if (!last_name)  missing.push('last_name');
    if (!job_title)  missing.push('job_title');
    if (!start_date) missing.push('start_date');

    // gender is required for new employees; probation scheduling is validated later
    if (role === 'NEW_EMPLOYEE') {
      if (!gender) missing.push('gender');
      // probation_end_date OR probation_duration_months must be supplied — validated after role check
    }

    if (missing.length) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}.`,
      });
    }

    // Validate gender value
    if (gender && !['Male', 'Female'].includes(gender)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'gender must be "Male" or "Female".' });
    }

    // FR-01: HR can create accounts for all roles including DIRECTOR.
    // SYSTEM_ADMIN is included so that additional SYSTEM_ADMIN accounts can be provisioned.
    const allowedRoles = ['NEW_EMPLOYEE', 'LINE_MANAGER', 'HR_ADMIN', 'SYSTEM_ADMIN', 'DIRECTOR'];
    if (!allowedRoles.includes(role)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${allowedRoles.join(', ')}.`,
      });
    }

    // ── Spec s.3.1: HR_ADMIN uniqueness guard ─────────────────────────────
    // At most one active HR_ADMIN is permitted at any time.
    // MySQL has no partial unique indexes, so we enforce this via a
    // transaction-level count check with 409 Conflict on violation.
    if (role === 'HR_ADMIN') {
      const existingHRAdminCount = await User.count({
        where: { role: 'HR_ADMIN', is_active: true },
        transaction: t,
      });
      if (existingHRAdminCount >= 1) {
        await t.rollback();
        return res.status(409).json({
          success:  false,
          message:  'An active HR_ADMIN account already exists. ' +
                    'Only one active HR_ADMIN is permitted at a time. ' +
                    'Deactivate the existing HR_ADMIN before creating a new one.',
        });
      }
    }

    // ── Spec s.3.2: Auto-generate password if not supplied ────────────────
    // If the caller omits 'password', a cryptographically secure 12-character
    // password is generated and sent to the new user via welcome email.
    // If 'password' is supplied explicitly, it is validated for strength.
    let plainTextPassword;
    let passwordWasAutoGenerated = false;

    if (!password) {
      plainTextPassword       = generateSecurePassword();
      passwordWasAutoGenerated = true;
    } else {
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        await t.rollback();
        return res.status(400).json({ success: false, message: pwCheck.message });
      }
      plainTextPassword = password;
    }

    // ── Spec s.3.4: Future date guard for new probation commencement ───────
    // start_date must be on or after today (Mauritius timezone UTC+4).
    // Historical/imported employees can be created by SYSTEM_ADMIN with a
    // bypass flag: req.body.allow_historical_start === 'true'.
    if (role === 'NEW_EMPLOYEE' && start_date) {
      const nowUtc4    = new Date(Date.now() + 4 * 60 * 60 * 1000);
      const todayMU    = new Date(
        Date.UTC(nowUtc4.getUTCFullYear(), nowUtc4.getUTCMonth(), nowUtc4.getUTCDate()),
      );
      const startDateObj = new Date(start_date + 'T00:00:00Z');
      const allowHistorical = req.body.allow_historical_start === 'true'
        && req.user.role === 'SYSTEM_ADMIN';

      if (startDateObj < todayMU && !allowHistorical) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message:
            'Probation start date must be today or a future date. ' +
            'To import a historical employee record, a SYSTEM_ADMIN may set ' +
            'allow_historical_start=true in the request.',
        });
      }
    }

    // Date validation — only required for NEW_EMPLOYEE
    if (role === 'NEW_EMPLOYEE') {
      const startD = new Date(start_date);
      if (Number.isNaN(startD.getTime())) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid start_date format.' });
      }

      // ── Spec s.1.4: Calendar-month checkpoint matrix ───────────────────
      // If probation_duration_months is supplied, auto-calculate end date
      // and checkpoint schedule from the matrix. Otherwise fall back to
      // an explicit probation_end_date + legacy checkpoint_days.
      let resolvedEndDate = probation_end_date || null;

      if (probation_duration_months != null) {
        const durMonths = parseInt(probation_duration_months, 10);
        if (!CHECKPOINT_MATRIX[durMonths]) {
          await t.rollback();
          return res.status(400).json({
            success: false,
            message: `probation_duration_months must be one of: ${Object.keys(CHECKPOINT_MATRIX).join(', ')}.`,
          });
        }
        // Auto-calculate end date as start_date + durMonths calendar months
        resolvedEndDate = addCalendarMonths(start_date, durMonths);
      }

      if (!resolvedEndDate) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Either probation_end_date or probation_duration_months is required for NEW_EMPLOYEE.',
        });
      }

      const endD = new Date(resolvedEndDate);
      if (endD <= startD) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Probation end date must be after the start date.',
        });
      }

      // Persist the resolved end date so the create call and
      // the ProbationPeriod both use the same value.
      req._resolvedProbationEndDate = resolvedEndDate;
    }

    // ── Check email uniqueness ─────────────────────────────────────────────
    const existingUser = await User.findOne({
      where: { email: email.toLowerCase().trim() },
      transaction: t,
    });
    if (existingUser) {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
    }

    // ── Create User ────────────────────────────────────────────────────────
    // plainTextPassword was resolved above (auto-generated or validated from body).
    const password_hash = await bcrypt.hash(plainTextPassword, 12);
    const newUser = await User.create({
      email:      email.toLowerCase().trim(),
      password_hash,
      role,
      first_name: first_name.trim(),
      last_name:  last_name.trim(),
      is_active:  true,
    }, { transaction: t });

    // ── Upload profile image to Cloudinary (if provided via multipart) ────
    let resolvedProfileImageUrl = profile_image_url || null;
    if (req.file) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinaryPkg.uploader.upload_stream(
            {
              folder:        'profile-images',
              resource_type: 'image',
              access_mode:   'public',
            },
            (err, res) => (err ? reject(err) : resolve(res))
          );
          const readable = new Readable();
          readable.push(req.file.buffer);
          readable.push(null);
          readable.pipe(stream);
        });
        resolvedProfileImageUrl = uploadResult.secure_url;
      } catch (imgErr) {
        // Non-fatal: profile image upload failure should not abort employee creation
        console.error('Profile image upload failed:', imgErr.message);
      }
    }

    // ── Create EmployeeProfile ─────────────────────────────────────────────
    const resolvedProbEnd = req._resolvedProbationEndDate || probation_end_date || null;

    const profile = await EmployeeProfile.create({
      user_id:            newUser.user_id,
      department_id:      department_id  || null,
      manager_id:         manager_id     || null,
      job_title:          job_title.trim(),
      phone:              phone?.trim()  || null,
      start_date,
      probation_end_date: resolvedProbEnd,
      gender:             gender              || null,
      nationality:        nationality?.trim() || null,
      salary_monthly:     salary_monthly      || null,
      employment_status:  'PROBATION',
      onboarding_status:  'IN_PROGRESS',
      // Spec s.2.3 — new nullable columns
      date_of_birth:               date_of_birth               || null,
      employment_type:             employment_type              || null,
      work_schedule_type:          work_schedule_type           || null,
      weekly_working_hours:        weekly_working_hours         || null,
      work_location:               work_location?.trim()        || null,
      evaluation_status:           evaluation_status            || (role === 'NEW_EMPLOYEE' ? 'PROBATION' : null),
      employment_history_summary:  employment_history_summary   || null,
      salary_scale_tier:           salary_scale_tier            || null,
      next_line_of_promotion:      next_line_of_promotion       || null,
      profile_image_url:           resolvedProfileImageUrl,
      // Spec s.2.3.1 — extended profile fields
      middle_name:                 middle_name?.trim()           || null,
      personal_email:              personal_email?.trim()        || null,
      // Address
      address_line_1:              address_line_1?.trim()        || null,
      address_line_2:              address_line_2?.trim()        || null,
      locality:                    locality?.trim()              || null,
      district:                    district?.trim()              || null,
      country:                     country?.trim()               || null,
      postal_code:                 postal_code?.trim()           || null,
      // Identity document
      id_document_type:            id_document_type              || null,
      nic_number:                  nic_number?.trim()            || null,
      passport_number:             passport_number?.trim()       || null,
      // Work permit
      work_permit_details:         work_permit_details?.trim()   || null,
      work_authorisation_expiry:   work_authorisation_expiry     || null,
      // Contract
      contract_end_date:           contract_end_date             || null,
      // Emergency contact
      emergency_contact_name:         emergency_contact_name?.trim()         || null,
      emergency_contact_relationship: emergency_contact_relationship?.trim() || null,
      emergency_contact_phone:        emergency_contact_phone?.trim()        || null,
      // Education & previous employment
      highest_qualification:       highest_qualification?.trim()   || null,
      field_of_study:              field_of_study?.trim()          || null,
      educational_institution:     educational_institution?.trim() || null,
      previous_job_title:          previous_job_title?.trim()      || null,
      previous_company_name:       previous_company_name?.trim()   || null,
      previous_salary_monthly:     previous_salary_monthly         || null,
      reporting_notes:             reporting_notes?.trim()         || null,
    }, { transaction: t });

    // ── Create LeaveBalance for current year (FR-21 / WRA 2019) ───────────
    // Only new employees who are going through onboarding get a leave balance.
    // Managers and admins being granted system access do not need one at creation.
    if (role === 'NEW_EMPLOYEE') {
      const currentYear = new Date().getFullYear();
      await LeaveBalance.create(
        buildLeaveBalance(profile.profile_id, currentYear, salary_monthly),
        { transaction: t }
      );
    }

    // ── Probation period + evaluation checkpoints — NEW_EMPLOYEE only ─────
    // Line Managers and HR Admins are existing staff members who need system
    // access. They are not probationary employees and must not be assigned a
    // probation period or evaluation checkpoints. (FR-11, FR-14)
    //
    // capturedCheckpoints is declared here so it is accessible after commit
    // for the manager assignment email (FR-11 / Task #31).
    let capturedCheckpoints = [];

    if (role === 'NEW_EMPLOYEE') {
      const probation = await ProbationPeriod.create({
        profile_id: profile.profile_id,
        start_date,
        end_date:   resolvedProbEnd,
        status:     'ACTIVE',
      }, { transaction: t });

      // ── Build evaluation checkpoint schedule (FR-11) ────────────────────
      // Spec s.1.4: Use calendar-month arithmetic when probation_duration_months
      // is provided. Otherwise fall back to legacy day-offset schedule.
      let checkpointRows = [];

      if (probation_duration_months != null && CHECKPOINT_MATRIX[parseInt(probation_duration_months, 10)]) {
        // Calendar-month matrix path
        const durMonths    = parseInt(probation_duration_months, 10);
        const monthOffsets = CHECKPOINT_MATRIX[durMonths];

        checkpointRows = monthOffsets.map((monthOffset, idx) => {
          const isLast   = idx === monthOffsets.length - 1;
          const dueDate  = addCalendarMonths(start_date, monthOffset);
          const label    = isLast
            ? `Month ${monthOffset} Final Checkpoint`
            : `Month ${monthOffset} Review`;
          return {
            period_id:        probation.period_id,
            checkpoint_label: label,
            day_number:       monthOffset * 30, // approximate day number for display/sorting
            due_date:         dueDate,
            status:           'PENDING',
          };
        });
      } else {
        // Legacy day-offset path — backward compatible with existing integrations
        let scheduleDays = [30, 60, 90];
        if (Array.isArray(checkpoint_days) && checkpoint_days.length > 0) {
          const parsed = checkpoint_days.map(Number).filter((d) => Number.isInteger(d) && d > 0);
          if (parsed.length === 0) {
            await t.rollback();
            return res.status(400).json({
              success: false,
              message: 'checkpoint_days must be a non-empty array of positive integers.',
            });
          }
          scheduleDays = [...new Set(parsed)].sort((a, b) => a - b);
        }

        checkpointRows = scheduleDays.map((day_number) => {
          const due = new Date(start_date + 'T00:00:00Z');
          due.setUTCDate(due.getUTCDate() + day_number);
          return {
            period_id:        probation.period_id,
            checkpoint_label: `Day-${day_number} Review`,
            day_number,
            due_date:         due.toISOString().slice(0, 10),
            status:           'PENDING',
          };
        });
      }

      await EvaluationCheckpoint.bulkCreate(checkpointRows, { transaction: t });

      // Capture for post-commit manager email
      capturedCheckpoints = checkpointRows;
    }

    await t.commit();

    // ── Post-commit email notifications (fire-and-forget — non-critical) ───
    if (role === 'NEW_EMPLOYEE') {
      // FR-09 / Task #30: Welcome email includes the temporary password so the
      // employee knows their initial credentials and is prompted to change them.
      // plainTextPassword is in memory only — never logged or stored.
      sendWelcomeEmail({
        to:                newUser.email,
        firstName:         newUser.first_name,
        temporaryPassword: plainTextPassword,
        wasAutoGenerated:  passwordWasAutoGenerated,
      }).catch(() => {});

      // G2-FIX FR-09: In-app welcome notification for the new employee.
      const { createNotification: _notifEmployee } = require('../services/notificationService');
      _notifEmployee({
        userId:  newUser.user_id,
        type:    'ACCOUNT_CREATED',
        message: `Welcome to HR Onboard, ${newUser.first_name}! Your account is ready. Please upload your required onboarding documents and complete any assigned tasks.`,
        relatedEntityType: null,
        relatedEntityId:   null,
      }).catch(() => {});

      // FR-11 / Task #31: Notify the assigned line manager about their new team
      // member and the evaluation checkpoint schedule.
      if (manager_id) {
        User.findByPk(manager_id, { attributes: ['user_id', 'email', 'first_name'] })
          .then((mgr) => {
            if (!mgr) return;

            // Email notification
            if (capturedCheckpoints.length > 0) {
              sendManagerAssignmentEmail({
                to:               mgr.email,
                managerFirstName: mgr.first_name,
                employeeFullName: `${newUser.first_name} ${newUser.last_name}`,
                jobTitle:         job_title,
                startDate:        start_date,
                checkpoints:      capturedCheckpoints.map((cp) => ({
                  label:    cp.checkpoint_label,
                  due_date: cp.due_date,
                })),
              }).catch(() => {});
            }

            // G3-FIX FR-11: In-app notification for the manager.
            const { createNotification: _notifMgr } = require('../services/notificationService');
            _notifMgr({
              userId:            mgr.user_id,
              type:              'EMPLOYEE_ASSIGNED',
              message:           `A new employee, ${newUser.first_name} ${newUser.last_name} (${job_title}), has been assigned to your team. ${capturedCheckpoints.length} evaluation checkpoint(s) have been scheduled.`,
              relatedEntityType: 'profile',
              relatedEntityId:   profile.profile_id,
            }).catch(() => {});
          })
          .catch(() => {});
      }
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'EMPLOYEE_CREATED',
      description: `HR created employee account for ${newUser.email} (${role}).`,
      ipAddress:   getIp(req),
    });

    return res.status(201).json({
      success: true,
      message: 'Employee account and profile created successfully.',
      data: {
        user_id:    newUser.user_id,
        email:      newUser.email,
        role:       newUser.role,
        first_name: newUser.first_name,
        last_name:  newUser.last_name,
        profile_id: profile.profile_id,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error('[employeeController.createEmployee]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create employee.' });
  }
};

// =============================================================================
// GET /api/employees
// Returns all employees (users with profiles) — HR and Manager.
// Managers only see employees assigned to them.
// FR-04 | NFR-03
// =============================================================================
const listEmployees = async (req, res) => {
  try {
    const { role, user_id } = req.user;

    // Line managers see only their assigned employees
    const profileWhere = role === 'LINE_MANAGER' ? { manager_id: user_id } : {};

    const profiles = await EmployeeProfile.findAll({
      where: profileWhere,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'email', 'role', 'first_name', 'last_name', 'is_active', 'created_at'],
          // Only return NEW_EMPLOYEE accounts — managers have EmployeeProfiles too
          // (for dept auto-select) but must not appear in the employee list.
          where: { role: 'NEW_EMPLOYEE' },
          required: true,
        },
        {
          model: Department,
          as: 'department',
          attributes: ['department_id', 'name'],
        },
        {
          model: User,
          as: 'manager',
          attributes: ['user_id', 'first_name', 'last_name', 'email'],
        },
        {
          model: ProbationPeriod,
          as: 'probationPeriods',
          attributes: ['period_id', 'start_date', 'end_date', 'status'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
    });

    return res.status(200).json({ success: true, data: profiles });
  } catch (error) {
    console.error('[employeeController.listEmployees]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve employees.' });
  }
};

// =============================================================================
// GET /api/employees/:id
// Returns a single employee profile with full detail.
// Employees can access their own profile. Managers only their assigned employees.
// FR-04 | NFR-03
// =============================================================================
const getEmployee = async (req, res) => {
  try {
    const { id } = req.params;           // profile_id
    const { role, user_id } = req.user;

    const profile = await EmployeeProfile.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'email', 'role', 'first_name', 'last_name', 'is_active', 'last_login_at', 'created_at'],
        },
        {
          model: Department,
          as: 'department',
          attributes: ['department_id', 'name'],
        },
        {
          model: User,
          as: 'manager',
          attributes: ['user_id', 'first_name', 'last_name', 'email'],
        },
        {
          model: ProbationPeriod,
          as: 'probationPeriods',
          attributes: ['period_id', 'start_date', 'end_date', 'status'],
          required: false,
        },
      ],
    });

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // Access control (NFR-03)
    if (role === 'NEW_EMPLOYEE' && profile.user_id !== user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (role === 'LINE_MANAGER' && profile.manager_id !== user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // G11B-FIX: Strip sensitive identity and financial fields before returning to
    // LINE_MANAGER or DIRECTOR. HR_ADMIN and the employee themselves retain full access.
    const SENSITIVE_FIELDS = ['nic_number', 'bank_account_number', 'tax_account_number'];
    if (role === 'LINE_MANAGER' || role === 'DIRECTOR') {
      const profileData = profile.toJSON();
      SENSITIVE_FIELDS.forEach((field) => delete profileData[field]);
      return res.status(200).json({ success: true, data: profileData });
    }

    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    console.error('[employeeController.getEmployee]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve employee.' });
  }
};

// =============================================================================
// PUT /api/employees/:id/profile
// Updates an employee's profile fields. HR_ADMIN only.
// FR-04, FR-21
// =============================================================================
const updateEmployeeProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      job_title,
      department_id,
      manager_id,
      phone,
      start_date,
      probation_end_date,
      onboarding_status,
      // New fields
      gender,
      nationality,
      salary_monthly,
      // employment_status is intentionally excluded: it may only be changed by the
      // Director-approval workflow (approveRecommendation in directorController).
      // Accepting it here would allow HR to bypass the approval chain (G03-FIX).
    } = req.body;

    const profile = await EmployeeProfile.findByPk(id);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // Validate dates if both are supplied
    if (start_date && probation_end_date) {
      const s = new Date(start_date);
      const e = new Date(probation_end_date);
      if (e <= s) {
        return res.status(400).json({
          success: false,
          message: 'Probation end date must be after the start date.',
        });
      }
    }

    // Validate gender if supplied (must match EmployeeProfile ENUM)
    const VALID_GENDERS = ['Male', 'Female'];
    if (gender !== undefined && !VALID_GENDERS.includes(gender)) {
      return res.status(400).json({ success: false, message: 'gender must be Male or Female.' });
    }

    // Use explicit undefined checks so that intentional null values (e.g.
    // unsetting a manager) are preserved instead of falling back to the
    // existing value. The ?? operator would swallow null and prevent clearing.
    await profile.update({
      job_title:          job_title         !== undefined ? job_title?.trim()       : profile.job_title,
      department_id:      department_id     !== undefined ? department_id            : profile.department_id,
      manager_id:         manager_id        !== undefined ? manager_id               : profile.manager_id,
      phone:              phone             !== undefined ? phone?.trim()            : profile.phone,
      start_date:         start_date        !== undefined ? start_date               : profile.start_date,
      probation_end_date: probation_end_date !== undefined ? probation_end_date      : profile.probation_end_date,
      onboarding_status:  onboarding_status !== undefined ? onboarding_status        : profile.onboarding_status,
      // New fields (Block 1 / lecturer requirements)
      gender:             gender            !== undefined ? gender                   : profile.gender,
      nationality:        nationality       !== undefined ? nationality?.trim()      : profile.nationality,
      salary_monthly:     salary_monthly    !== undefined ? salary_monthly           : profile.salary_monthly,
      updated_at:         new Date(),
    });

    // If salary_monthly changed, re-evaluate vacation leave eligibility for the
    // current year's LeaveBalance (WRA 2019 s.47 threshold: MUR 50,000/month).
    if (salary_monthly !== undefined && profile.user_id) {
      const currentYear = new Date().getFullYear();
      const leaveBalance = await LeaveBalance.findOne({
        where: { profile_id: id, year: currentYear },
      });
      if (leaveBalance) {
        const VACATION_THRESHOLD = 50000;
        const newSalary = Number.parseFloat(salary_monthly);
        const nowEligible = !Number.isNaN(newSalary) && newSalary <= VACATION_THRESHOLD;
        await leaveBalance.update({
          vacation_leave_eligible: nowEligible,
          vacation_leave_entitled: nowEligible ? 6.0 : 0.0,
        });
      }
    }

    // Keep ProbationPeriod.end_date in sync with EmployeeProfile.probation_end_date.
    // The HR dashboard reads days-left from ProbationPeriod, so both tables must
    // reflect the same value whenever a probation end date change is saved.
    if (probation_end_date !== undefined) {
      const probationRecord = await ProbationPeriod.findOne({ where: { profile_id: id } });
      if (probationRecord) {
        await probationRecord.update({ end_date: probation_end_date });
      }
    }

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'EMPLOYEE_UPDATED',
      description: `Profile ID ${id} updated by HR.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({ success: true, message: 'Profile updated.', data: profile });
  } catch (error) {
    console.error('[employeeController.updateEmployeeProfile]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// =============================================================================
// PATCH /api/employees/me/avatar
// Self-service profile image upload. Available to any role that has an
// EmployeeProfile (NEW_EMPLOYEE, LINE_MANAGER, HR_ADMIN, DIRECTOR).
// Image is streamed to Cloudinary; profile_image_url is updated in DB.
// AppShell reads this URL for the top-nav consolidated profile block.
// Spec s.4.1 | FR-04 | NFR-02
// =============================================================================
const updateMyAvatar = async (req, res) => {
  try {
    const { user_id } = req.user;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }

    const profile = await EmployeeProfile.findOne({ where: { user_id } });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // Stream buffer to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinaryPkg.uploader.upload_stream(
        { folder: 'profile-images', resource_type: 'image', access_mode: 'public' },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      const readable = new Readable();
      readable.push(req.file.buffer);
      readable.push(null);
      readable.pipe(stream);
    });

    await profile.update({ profile_image_url: uploadResult.secure_url });

    await createAuditLog({
      userId:      user_id,
      actionType:  'PROFILE_IMAGE_UPDATED',
      description: `User (user_id ${user_id}) updated their profile image.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success:           true,
      message:           'Profile image updated successfully.',
      profile_image_url: uploadResult.secure_url,
    });
  } catch (error) {
    console.error('[employeeController.updateMyAvatar]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile image.' });
  }
};

// =============================================================================
// PATCH /api/employees/me/profile
// Employee self-service: update only the fields the employee is permitted to
// provide — personal contact details, emergency contact, education, and
// previous job title. HR-locked fields (job title, department, salary, etc.)
// are intentionally excluded.
// Spec s.4.4 | FR-04 | NFR-03
// =============================================================================
const updateMyProfile = async (req, res) => {
  try {
    const { user_id } = req.user;

    const profile = await EmployeeProfile.findOne({ where: { user_id } });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const {
      personal_email,
      emergency_contact_name,
      emergency_contact_relationship,
      emergency_contact_phone,
      highest_qualification,
      field_of_study,
      educational_institution,
      previous_job_title,
    } = req.body;

    // Validate personal_email format if supplied
    if (personal_email !== undefined && personal_email !== null && personal_email !== '') {
      const emailRe = /^[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/;
      if (!emailRe.test(personal_email)) {
        return res.status(400).json({ success: false, message: 'Invalid personal email address.' });
      }
      // Must differ from work email
      const user = await User.findByPk(user_id, { attributes: ['email'] });
      if (user && personal_email.toLowerCase() === user.email.toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: 'Personal email must differ from your work email.',
        });
      }
    }

    await profile.update({
      personal_email:                 personal_email                 !== undefined ? (personal_email || null)                 : profile.personal_email,
      emergency_contact_name:         emergency_contact_name         !== undefined ? (emergency_contact_name || null)         : profile.emergency_contact_name,
      emergency_contact_relationship: emergency_contact_relationship !== undefined ? (emergency_contact_relationship || null) : profile.emergency_contact_relationship,
      emergency_contact_phone:        emergency_contact_phone        !== undefined ? (emergency_contact_phone || null)        : profile.emergency_contact_phone,
      highest_qualification:          highest_qualification          !== undefined ? (highest_qualification || null)          : profile.highest_qualification,
      field_of_study:                 field_of_study                 !== undefined ? (field_of_study || null)                 : profile.field_of_study,
      educational_institution:        educational_institution        !== undefined ? (educational_institution || null)        : profile.educational_institution,
      previous_job_title:             previous_job_title             !== undefined ? (previous_job_title || null)             : profile.previous_job_title,
      updated_at:                     new Date(),
    });

    await createAuditLog({
      userId:      user_id,
      actionType:  'EMPLOYEE_SELF_UPDATE',
      description: `Employee (user_id ${user_id}) updated their own profile details.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({ success: true, message: 'Profile updated successfully.', data: profile });
  } catch (error) {
    console.error('[employeeController.updateMyProfile]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// =
// =============================================================================
// PATCH /api/employees/:id/toggle-status
// HR Admin activates or deactivates a user account.
// FR-01, FR-18 | NFR-03
// =============================================================================
const toggleUserStatus = async (req, res) => {
  try {
    const id = req.params.userId ?? req.params.id;

    const user = await User.findByPk(id, { attributes: ['user_id', 'is_active', 'role', 'first_name', 'last_name'] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent deactivating SYSTEM_ADMIN accounts
    if (user.role === 'SYSTEM_ADMIN') {
      return res.status(403).json({ success: false, message: 'System Administrator accounts cannot be deactivated.' });
    }

    const newStatus = !user.is_active;
    await user.update({ is_active: newStatus });

    const { createAuditLog } = require('../utils/auditLogger');
    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  newStatus ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      description: `User ${user.first_name} ${user.last_name} (ID: ${id}) ${newStatus ? 'activated' : 'deactivated'} by HR.`,
      ipAddress:   req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
    });

    return res.json({
      success: true,
      message: `User account ${newStatus ? 'activated' : 'deactivated'} successfully.`,
      data: { user_id: user.user_id, is_active: newStatus },
    });
  } catch (error) {
    console.error('[employeeController.toggleUserStatus]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to toggle user status.' });
  }
};

// =============================================================================
// GET /api/employees/managers
// Returns all active LINE_MANAGER and HR_ADMIN accounts — used when creating
// employee profiles. HR_ADMIN is included so HR staff can be assigned to the
// HR Admin as their reporting manager.
// FR-04 | NFR-03
// =============================================================================
const listManagers = async (req, res) => {
  try {
    const managers = await User.findAll({
      where: { role: { [Op.in]: ['LINE_MANAGER', 'HR_ADMIN'] }, is_active: true },
      attributes: ['user_id', 'first_name', 'last_name', 'email', 'role'],
      // Spec s.4.2: include department_id and job_title so the frontend can
      // cascade the manager dropdown by selected department and show job titles.
      include: [
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          attributes: ['department_id', 'job_title'],
          required: false,
        },
      ],
      order: [['first_name', 'ASC'], ['last_name', 'ASC']],
    });

    return res.json({ success: true, data: managers });
  } catch (error) {
    console.error('[employeeController.listManagers]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve managers.' });
  }
};

// =============================================================================
// GET /api/employees/all-users
// SYSTEM_ADMIN: list every user in the system for the User Management page.
// FR-01 | NFR-03
// =============================================================================
const listAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['user_id', 'first_name', 'last_name', 'email', 'role', 'is_active', 'last_login_at', 'created_at'],
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('[employeeController.listAllUsers]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
};


// =============================================================================
// GET /api/employees/me/leave-balance       — NEW_EMPLOYEE (own record)
// GET /api/employees/:profileId/leave-balance — HR_ADMIN, LINE_MANAGER
//
// Returns the LeaveBalance record for the specified employee and the current
// calendar year. If a record for the current year does not yet exist (e.g. the
// employee was onboarded in a previous year and no year-end rollover has been
// run), it falls back to the most recent year available.
//
// FR-04 (extended) | WRA 2019 s.45–47 | NFR-03
// =============================================================================
async function getLeaveBalance(req, res) {
  try {
    const { role, profileId: callerProfileId } = req.user;
    let targetProfileId;

    if (req.params.profileId) {
      // HR / Manager path: :profileId supplied in URL
      targetProfileId = Number(req.params.profileId);
    } else {
      // Self-service path: /me/leave-balance
      targetProfileId = callerProfileId;
    }

    if (!targetProfileId) {
      return res.status(400).json({ success: false, message: 'Profile ID could not be determined.' });
    }

    // NEW_EMPLOYEE may only fetch their own balance
    if (role === 'NEW_EMPLOYEE' && targetProfileId !== callerProfileId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const currentYear = new Date().getFullYear();

    // Try current year first; fall back to most recent available year
    let balance = await LeaveBalance.findOne({
      where: { profile_id: targetProfileId, year: currentYear },
    });

    if (!balance) {
      balance = await LeaveBalance.findOne({
        where: { profile_id: targetProfileId },
        order: [['year', 'DESC']],
      });
    }

    if (!balance) {
      return res.status(404).json({ success: false, message: 'No leave balance record found for this employee.' });
    }

    return res.json({ success: true, data: balance });
  } catch (err) {
    console.error('[getLeaveBalance]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve leave balance.' });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployeeProfile,
  updateMyProfile,
  updateMyAvatar,
  toggleUserStatus,
  listManagers,
  listAllUsers,
  getLeaveBalance,
  // Exported so documentController and taskController can trigger auto-completion
  checkOnboardingCompletion,
};
