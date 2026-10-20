// =============================================================================
// src/controllers/employeeController.js
// Employee profile management — create, list, get, update, toggle status
// FR-01, FR-04, FR-21 | NFR-02, NFR-03 | Objective 1
// Updated: accepts gender/nationality/salary_monthly; auto-creates LeaveBalance;
//          adds DIRECTOR to allowedRoles; adds onboarding completion helper
// =============================================================================

const bcrypt    = require('bcrypt');
const { sequelize, User, EmployeeProfile, Department, ProbationPeriod, EvaluationCheckpoint, LeaveBalance, OnboardingDocument, TaskAssignment } = require('../models');
const { createAuditLog }                                    = require('../utils/auditLogger');
const { validatePasswordStrength }                          = require('../utils/passwordValidator');
const { sendWelcomeEmail, sendManagerAssignmentEmail }      = require('../utils/mailer');

// =============================================================================
// HELPER: buildLeaveBalance
// Creates a LeaveBalance record for the given profile and calendar year.
// Called inside the create-employee transaction for new employees.
// WRA 2019: Annual Leave s.45, Sick Leave s.46, Vacation Leave s.47
// =============================================================================
const buildLeaveBalance = (profileId, year, salaryMonthly) => {
  const VACATION_SALARY_THRESHOLD = 50000; // MUR — WRA 2019 s.47
  const vacationEligible = salaryMonthly != null && parseFloat(salaryMonthly) <= VACATION_SALARY_THRESHOLD;

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

    // All assigned tasks must be COMPLETED
    const incompleteTasks = await TaskAssignment.count({
      where: { profile_id: profileId, status: ['PENDING', 'IN_PROGRESS'] },
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
      password,
      role,
      first_name,
      last_name,
      // Profile fields
      job_title,
      department_id,
      manager_id,
      phone,
      start_date,
      probation_end_date,
      // New fields (Block 3 — FR-21 / lecturer requirements)
      gender,           // REQUIRED for NEW_EMPLOYEE: 'Male' | 'Female'
      nationality,      // Optional: string
      salary_monthly,   // Optional: number — determines Vacation Leave eligibility (WRA 2019 s.47)
      // Optional: custom checkpoint schedule for NEW_EMPLOYEE (FR-11)
      // Defaults to [30, 60, 90] when not provided.
      checkpoint_days,
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

    // probation_end_date and gender are only required for new employees
    if (role === 'NEW_EMPLOYEE') {
      if (!probation_end_date) missing.push('probation_end_date');
      if (!gender)             missing.push('gender');
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

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      await t.rollback();
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    // Date validation — only required for NEW_EMPLOYEE
    if (role === 'NEW_EMPLOYEE') {
      const startD = new Date(start_date);
      const endD   = new Date(probation_end_date);
      if (Number.isNaN(startD) || Number.isNaN(endD)) {
        await t.rollback();
        return res.status(400).json({ success: false, message: 'Invalid date format.' });
      }
      if (endD <= startD) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: 'Probation end date must be after the start date.',
        });
      }
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
    const password_hash = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      email:      email.toLowerCase().trim(),
      password_hash,
      role,
      first_name: first_name.trim(),
      last_name:  last_name.trim(),
      is_active:  true,
    }, { transaction: t });

    // ── Create EmployeeProfile ─────────────────────────────────────────────
    const profile = await EmployeeProfile.create({
      user_id:           newUser.user_id,
      department_id:     department_id  || null,
      manager_id:        manager_id     || null,
      job_title:         job_title.trim(),
      phone:             phone?.trim()  || null,
      start_date,
      probation_end_date: probation_end_date || null,
      gender:            gender              || null,
      nationality:       nationality?.trim() || null,
      salary_monthly:    salary_monthly      || null,
      employment_status: 'PROBATION',
      onboarding_status: 'IN_PROGRESS',
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
        end_date:   probation_end_date,
        status:     'ACTIVE',
      }, { transaction: t });

      // Build evaluation checkpoint schedule (FR-11)
      // HR may supply a custom array of day numbers; default is [30, 60, 90].
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
        scheduleDays = [...new Set(parsed)].sort((a, b) => a - b); // dedup + sort ascending
      }

      const startDateObj = new Date(start_date);
      const checkpointRows = scheduleDays.map((day_number) => {
        const due = new Date(startDateObj);
        due.setDate(due.getDate() + day_number);
        return {
          period_id:        probation.period_id,
          checkpoint_label: `Day-${day_number} Review`,
          day_number,
          due_date:         due.toISOString().slice(0, 10),
          status:           'PENDING',
        };
      });
      await EvaluationCheckpoint.bulkCreate(checkpointRows, { transaction: t });

      // Capture for post-commit manager email
      capturedCheckpoints = checkpointRows;
    }

    await t.commit();

    // ── Post-commit email notifications (fire-and-forget — non-critical) ───
    if (role === 'NEW_EMPLOYEE') {
      // FR-09 / Task #30: Welcome email includes the temporary password so the
      // employee knows their initial credentials and is prompted to change them.
      sendWelcomeEmail({
        to:                newUser.email,
        firstName:         newUser.first_name,
        temporaryPassword: password,  // plain-text from req.body, only in memory
      }).catch(() => {});

      // FR-11 / Task #31: Notify the assigned line manager about their new team
      // member and the evaluation checkpoint schedule.
      if (manager_id && capturedCheckpoints.length > 0) {
        User.findByPk(manager_id, { attributes: ['email', 'first_name'] })
          .then((mgr) => {
            if (!mgr) return;
            return sendManagerAssignmentEmail({
              to:               mgr.email,
              managerFirstName: mgr.first_name,
              employeeFullName: `${newUser.first_name} ${newUser.last_name}`,
              jobTitle:         job_title,
              startDate:        start_date,
              checkpoints:      capturedCheckpoints.map((cp) => ({
                label:    cp.checkpoint_label,
                due_date: cp.due_date,
              })),
            });
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
      employment_status,
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

    // Validate employment_status if supplied
    const VALID_EMP_STATUSES = ['PROBATION', 'PERMANENT', 'DISMISSED', 'EXTENDED'];
    if (employment_status !== undefined && !VALID_EMP_STATUSES.includes(employment_status)) {
      return res.status(400).json({
        success: false,
        message: `employment_status must be one of: ${VALID_EMP_STATUSES.join(', ')}.`,
      });
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
      employment_status:  employment_status !== undefined ? employment_status        : profile.employment_status,
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
        const newSalary = parseFloat(salary_monthly);
        const nowEligible = !isNaN(newSalary) && newSalary <= VACATION_THRESHOLD;
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
// Returns all active LINE_MANAGER accounts — used when creating employee profiles.
// FR-04 | NFR-03
// =============================================================================
const listManagers = async (req, res) => {
  try {
    const managers = await User.findAll({
      where: { role: 'LINE_MANAGER', is_active: true },
      attributes: ['user_id', 'first_name', 'last_name', 'email'],
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
      attributes: ['user_id', 'first_name', 'last_name', 'email', 'role', 'is_active', 'created_at'],
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: users });
  } catch (error) {
    console.error('[employeeController.listAllUsers]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
};


// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployeeProfile,
  toggleUserStatus,
  listManagers,
  listAllUsers,
  // Exported so documentController and taskController can trigger auto-completion
  checkOnboardingCompletion,
};
