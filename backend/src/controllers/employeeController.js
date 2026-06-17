// =============================================================================
// src/controllers/employeeController.js
// Employee profile management — create, list, get, update, toggle status
// FR-01, FR-04 | NFR-02, NFR-03 | Objective 1
// =============================================================================

const bcrypt    = require('bcrypt');
const { sequelize, User, EmployeeProfile, Department, ProbationPeriod, EvaluationCheckpoint } = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// POST /api/employees
// HR creates a new user account + employee profile + probation period atomically.
// FR-01, FR-04 | NFR-02, NFR-03
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

    // probation_end_date is only required for new employees going through onboarding
    if (role === 'NEW_EMPLOYEE' && !probation_end_date) {
      missing.push('probation_end_date');
    }

    if (missing.length) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}.`,
      });
    }

    const allowedRoles = ['NEW_EMPLOYEE', 'LINE_MANAGER', 'HR_ADMIN'];
    if (!allowedRoles.includes(role)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${allowedRoles.join(', ')}.`,
      });
    }

    if (password.length < 8) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Date validation — only required for NEW_EMPLOYEE
    if (role === 'NEW_EMPLOYEE') {
      const startD = new Date(start_date);
      const endD   = new Date(probation_end_date);
      if (isNaN(startD) || isNaN(endD)) {
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
      user_id:          newUser.user_id,
      department_id:    department_id || null,
      manager_id:       manager_id    || null,
      job_title:        job_title.trim(),
      phone:            phone?.trim() || null,
      start_date,
      probation_end_date,
      onboarding_status: 'IN_PROGRESS',
    }, { transaction: t });

    // ── Probation period + evaluation checkpoints — NEW_EMPLOYEE only ─────
    // Line Managers and HR Admins are existing staff members who need system
    // access. They are not probationary employees and must not be assigned a
    // probation period or evaluation checkpoints. (FR-11, FR-14)
    if (role === 'NEW_EMPLOYEE') {
      const probation = await ProbationPeriod.create({
        profile_id: profile.profile_id,
        start_date,
        end_date:   probation_end_date,
        status:     'ACTIVE',
      }, { transaction: t });

      // Auto-create 30/60/90-day evaluation checkpoints (FR-11)
      const startDateObj = new Date(start_date);
      const checkpointDefs = [
        { day_number: 30, checkpoint_label: '30-Day Review' },
        { day_number: 60, checkpoint_label: '60-Day Review' },
        { day_number: 90, checkpoint_label: '90-Day Review' },
      ];
      const checkpointRows = checkpointDefs.map(({ day_number, checkpoint_label }) => {
        const due = new Date(startDateObj);
        due.setDate(due.getDate() + day_number);
        return {
          period_id:        probation.period_id,
          checkpoint_label,
          day_number,
          due_date:         due.toISOString().slice(0, 10),
          status:           'PENDING',
        };
      });
      await EvaluationCheckpoint.bulkCreate(checkpointRows, { transaction: t });
    }

    await t.commit();

    // ── Audit log ──────────────────────────────────────────────────────────
    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'CREATE_EMPLOYEE',
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
// FR-04
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

    await profile.update({
      job_title:         job_title?.trim()       ?? profile.job_title,
      department_id:     department_id            ?? profile.department_id,
      manager_id:        manager_id               ?? profile.manager_id,
      phone:             phone?.trim()            ?? profile.phone,
      start_date:        start_date               ?? profile.start_date,
      probation_end_date: probation_end_date      ?? profile.probation_end_date,
      onboarding_status: onboarding_status        ?? profile.onboarding_status,
      updated_at:        new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'UPDATE_EMPLOYEE_PROFILE',
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
// PATCH /api/employees/:userId/status
// Activates or deactivates a user account. HR_ADMIN only.
// FR-01 | NFR-03
// =============================================================================
const toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'is_active must be a boolean.' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // HR cannot deactivate their own account
    if (user.user_id === req.user.user_id) {
      return res.status(400).json({ success: false, message: 'You cannot change your own account status.' });
    }

    await user.update({ is_active, updated_at: new Date() });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      description: `User ${user.email} ${is_active ? 'activated' : 'deactivated'}.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: `User account ${is_active ? 'activated' : 'deactivated'}.`,
    });
  } catch (error) {
    console.error('[employeeController.toggleUserStatus]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update user status.' });
  }
};

// =============================================================================
// GET /api/employees/managers
// Returns all LINE_MANAGER users for the manager dropdown. HR_ADMIN only.
// FR-04
// =============================================================================
const listManagers = async (req, res) => {
  try {
    const managers = await User.findAll({
      where: { role: 'LINE_MANAGER', is_active: true },
      attributes: ['user_id', 'first_name', 'last_name', 'email'],
      order: [['last_name', 'ASC']],
    });
    return res.status(200).json({ success: true, data: managers });
  } catch (error) {
    console.error('[employeeController.listManagers]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve managers.' });
  }
};

module.exports = {
  createEmployee,
  listEmployees,
  getEmployee,
  updateEmployeeProfile,
  toggleUserStatus,
  listManagers,
};
