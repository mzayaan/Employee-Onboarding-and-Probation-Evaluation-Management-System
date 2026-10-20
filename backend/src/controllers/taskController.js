// =============================================================================
// src/controllers/taskController.js
// Handles onboarding task assignment, listing, status updates and progress.
// FR-07, FR-08, FR-09, FR-18 | NFR-02, NFR-03 | Objective 1
//
// Updated (Block 4 — lecturer requirement):
//   A LINE_MANAGER may only assign / view / delete tasks for employees who
//   belong to the department the manager is dedicated to (Department.manager_id).
//   The old per-employee manager_id check has been replaced by a department-
//   level check everywhere a LINE_MANAGER acts on task data.
// =============================================================================

const {
  OnboardingTask,
  TaskAssignment,
  EmployeeProfile,
  Department,
  User,
} = require('../models');

const { createAuditLog }                      = require('../utils/auditLogger');
const { createNotification }                   = require('../services/notificationService');
const { sendTaskAssignedEmail }                = require('../utils/mailer');
const { checkOnboardingCompletion }            = require('./employeeController');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// HELPER: getManagerDepartment
// Returns the Department row where manager_id = managerId, or null.
// Used to enforce the one-department-per-manager rule across all task actions.
// FR-19 (lecturer requirement)
// =============================================================================
const getManagerDepartment = (managerId) =>
  Department.findOne({ where: { manager_id: managerId } });

// =============================================================================
// POST /api/tasks/assign
// HR Admin or Line Manager creates a task and assigns it to an employee.
// FR-07, FR-18
// =============================================================================
const assignTask = async (req, res) => {
  try {
    const { profile_id, title, description, priority, due_date } = req.body;

    if (!profile_id || !title || !due_date) {
      return res.status(400).json({
        success: false,
        message: 'profile_id, title and due_date are required.',
      });
    }

    // Verify employee profile exists
    const profile = await EmployeeProfile.findByPk(profile_id, {
      include: [{ model: User, as: 'user', attributes: ['user_id', 'first_name', 'last_name', 'email'] }],
    });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // FR-19 / NFR-03: LINE_MANAGER may only assign tasks to employees who belong
    // to the department the manager is dedicated to (Department.manager_id).
    // This replaces the old per-employee manager_id check with a departmental check.
    if (req.user.role === 'LINE_MANAGER') {
      const managerDept = await getManagerDepartment(req.user.user_id);
      if (!managerDept) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You are not assigned as the manager of any department.',
        });
      }
      if (profile.department_id !== managerDept.department_id) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You may only assign tasks to employees in your department ("${managerDept.name}").`,
        });
      }
    }

    // Create task template — stamp department_id so the task is linked to the
    // employee's department (supports future departmental task filtering).
    const task = await OnboardingTask.create({
      title:            title.trim(),
      description:      description?.trim() || null,
      priority:         priority || 'MEDIUM',
      created_by:       req.user.user_id,
      department_id:    profile.department_id || null,
      default_due_days: null,
    });

    // Create assignment
    const assignment = await TaskAssignment.create({
      profile_id:  Number(profile_id),
      task_id:     task.task_id,
      assigned_by: req.user.user_id,
      due_date,
      status:      'TODO',
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'TASK_ASSIGNED',
      description: `Task "${task.title}" assigned to profile_id ${profile_id} (assignment_id: ${assignment.assignment_id}).`,
      ipAddress:   getIp(req),
    });

    // FR-09: notify the employee by email (fire-and-forget — non-critical)
    sendTaskAssignedEmail({
      to:              profile.user.email,
      firstName:       profile.user.first_name,
      taskTitle:       task.title,
      taskDescription: task.description,
      dueDate:         due_date,
    }).catch(() => {});

    // In-app notification
    createNotification({
      userId:  profile.user.user_id,
      type:    'TASK_ASSIGNED',
      message: `You have been assigned a new task: "${task.title}". Due: ${due_date ? new Date(due_date).toDateString() : 'No deadline'}.`,
      relatedEntityType: 'task',
      relatedEntityId:   assignment.assignment_id,
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'Task assigned successfully.',
      data: {
        assignment_id: assignment.assignment_id,
        task_id:       task.task_id,
        title:         task.title,
        description:   task.description,
        priority:      task.priority,
        due_date:      assignment.due_date,
        status:        assignment.status,
        profile_id:    assignment.profile_id,
      },
    });
  } catch (error) {
    console.error('[taskController.assignTask]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to assign task.' });
  }
};

// =============================================================================
// GET /api/tasks/my
// Employee views their own task assignments with task details.
// FR-08 | NFR-03
// =============================================================================
const getMyTasks = async (req, res) => {
  try {
    const profile = await EmployeeProfile.findOne({ where: { user_id: req.user.user_id } });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const assignments = await TaskAssignment.findAll({
      where: { profile_id: profile.profile_id },
      include: [
        { model: OnboardingTask, as: 'task', attributes: ['task_id', 'title', 'description', 'priority'] },
        { model: User, as: 'assigner', attributes: ['user_id', 'first_name', 'last_name'] },
      ],
      order: [['due_date', 'ASC']],
    });

    return res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('[taskController.getMyTasks]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve tasks.' });
  }
};

// =============================================================================
// GET /api/tasks/assignments
// HR views all task assignments; LINE_MANAGER sees only their own team (NFR-03).
// Optional query: ?profile_id=X to filter by employee.
// FR-07, FR-08 | NFR-03
// =============================================================================
const getAllAssignments = async (req, res) => {
  try {
    const where = {};
    if (req.query.profile_id) {
      where.profile_id = Number(req.query.profile_id);
    }

    // FR-19 / NFR-03: LINE_MANAGER may only see assignments for employees in their department.
    let profileWhere = {};
    if (req.user.role === 'LINE_MANAGER') {
      const managerDept = await getManagerDepartment(req.user.user_id);
      profileWhere = managerDept ? { department_id: managerDept.department_id } : { department_id: -1 }; // -1 returns nothing if unassigned
    }

    const assignments = await TaskAssignment.findAll({
      where,
      subQuery: false,
      include: [
        {
          model: OnboardingTask,
          as: 'task',
          attributes: ['task_id', 'title', 'description', 'priority'],
        },
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          where: profileWhere,
          required: Object.keys(profileWhere).length > 0,
          attributes: ['profile_id', 'job_title'],
          include: [
            { model: User, as: 'user', attributes: ['user_id', 'first_name', 'last_name', 'email'] },
          ],
        },
        {
          model: User,
          as: 'assigner',
          attributes: ['user_id', 'first_name', 'last_name'],
        },
      ],
      order: [['due_date', 'ASC']],
    });

    return res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('[taskController.getAllAssignments]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve task assignments.' });
  }
};

// =============================================================================
// GET /api/tasks/assignments/employee/:profileId
// HR or Manager views tasks for a specific employee.
// Line Managers may only view assignments for employees they manage (NFR-03).
// FR-07, FR-08 | NFR-03
// =============================================================================
const getAssignmentsByEmployee = async (req, res) => {
  try {
    const { profileId } = req.params;

    // FR-19 / NFR-03: LINE_MANAGER may only view tasks for employees in their department.
    if (req.user.role === 'LINE_MANAGER') {
      const [targetProfile, managerDept] = await Promise.all([
        EmployeeProfile.findByPk(profileId, { attributes: ['department_id'] }),
        getManagerDepartment(req.user.user_id),
      ]);
      if (!targetProfile) {
        return res.status(404).json({ success: false, message: 'Employee profile not found.' });
      }
      if (!managerDept || targetProfile.department_id !== managerDept.department_id) {
        return res.status(403).json({ success: false, message: 'Access denied. This employee is not in your department.' });
      }
    }

    const assignments = await TaskAssignment.findAll({
      where: { profile_id: profileId },
      include: [
        { model: OnboardingTask, as: 'task', attributes: ['task_id', 'title', 'description', 'priority'] },
        { model: User, as: 'assigner', attributes: ['user_id', 'first_name', 'last_name'] },
      ],
      order: [['due_date', 'ASC']],
    });

    // Progress calculation
    const total     = assignments.length;
    const completed = assignments.filter((a) => a.status === 'COMPLETED').length;
    const overdue   = assignments.filter(
      (a) => a.status !== 'COMPLETED' && new Date(a.due_date) < new Date()
    ).length;
    const progress  = total > 0 ? Math.round((completed / total) * 100) : 0;

    return res.json({
      success: true,
      data: assignments,
      summary: { total, completed, overdue, progress },
    });
  } catch (error) {
    console.error('[taskController.getAssignmentsByEmployee]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve tasks.' });
  }
};

// =============================================================================
// PATCH /api/tasks/assignments/:id/status
// Employee (or HR) updates the status of a task assignment.
// FR-08, FR-18 | NFR-03
// =============================================================================
const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const VALID_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be TODO, IN_PROGRESS or COMPLETED.',
      });
    }

    const assignment = await TaskAssignment.findByPk(id, {
      include: [{ model: OnboardingTask, as: 'task', attributes: ['title'] }],
    });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Task assignment not found.' });
    }

    // Employees may only update their own tasks
    if (req.user.role === 'NEW_EMPLOYEE') {
      const profile = await EmployeeProfile.findOne({ where: { user_id: req.user.user_id } });
      if (!profile || assignment.profile_id !== profile.profile_id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    const updates = { status };
    if (status === 'COMPLETED' && !assignment.completed_at) {
      updates.completed_at = new Date();
    }
    if (status !== 'COMPLETED') {
      updates.completed_at = null;
    }

    await assignment.update(updates);

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'TASK_STATUS_UPDATED',
      description: `Task assignment ${id} ("${assignment.task?.title}") status changed to ${status}.`,
      ipAddress:   getIp(req),
    });

    // FR-08: when a task is marked COMPLETED, check if all tasks + docs are done
    // so we can auto-set onboarding_status = 'COMPLETED' for this employee.
    if (status === 'COMPLETED') {
      checkOnboardingCompletion(assignment.profile_id).catch(() => {});
    }

    return res.json({
      success: true,
      message: 'Task status updated.',
      data: {
        assignment_id: assignment.assignment_id,
        status:        assignment.status,
        completed_at:  assignment.completed_at,
      },
    });
  } catch (error) {
    console.error('[taskController.updateTaskStatus]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update task status.' });
  }
};

// =============================================================================
// DELETE /api/tasks/assignments/:id
// HR Admin removes a task assignment entirely.
// FR-07, FR-18
// =============================================================================
const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await TaskAssignment.findByPk(id, {
      include: [{ model: OnboardingTask, as: 'task', attributes: ['title'] }],
    });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Task assignment not found.' });
    }

    // FR-19 / NFR-03: LINE_MANAGER may only delete tasks for employees in their department.
    if (req.user.role === 'LINE_MANAGER') {
      const [targetProfile, managerDept] = await Promise.all([
        EmployeeProfile.findByPk(assignment.profile_id, { attributes: ['department_id'] }),
        getManagerDepartment(req.user.user_id),
      ]);
      if (!targetProfile || !managerDept || targetProfile.department_id !== managerDept.department_id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You may only delete tasks for employees in your department.',
        });
      }
    }

    const taskTitle = assignment.task?.title || `ID ${id}`;
    const profileId = assignment.profile_id;

    await assignment.destroy();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'TASK_DELETED',
      description: `Task assignment "${taskTitle}" (assignment_id: ${id}) deleted from profile_id ${profileId}.`,
      ipAddress:   getIp(req),
    });

    return res.json({ success: true, message: 'Task assignment deleted.' });
  } catch (error) {
    console.error('[taskController.deleteAssignment]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete task assignment.' });
  }
};

module.exports = {
  assignTask,
  getMyTasks,
  getAllAssignments,
  getAssignmentsByEmployee,
  updateTaskStatus,
  deleteAssignment,
};
