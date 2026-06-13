// =============================================================================
// src/controllers/taskController.js
// Handles onboarding task assignment, listing, status updates and progress.
// FR-07, FR-08, FR-09, FR-18 | NFR-02, NFR-03 | Objective 1
// =============================================================================

const {
  OnboardingTask,
  TaskAssignment,
  EmployeeProfile,
  User,
} = require('../models');

const { createAuditLog } = require('../utils/auditLogger');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

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
      include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email'] }],
    });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // Create task template
    const task = await OnboardingTask.create({
      title:            title.trim(),
      description:      description?.trim() || null,
      priority:         priority || 'MEDIUM',
      created_by:       req.user.user_id,
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
// HR views all task assignments across all employees.
// Optional query: ?profile_id=X to filter by employee.
// FR-07, FR-08 | NFR-03
// =============================================================================
const getAllAssignments = async (req, res) => {
  try {
    const where = {};
    if (req.query.profile_id) {
      where.profile_id = Number(req.query.profile_id);
    }

    const assignments = await TaskAssignment.findAll({
      where,
      include: [
        { model: OnboardingTask, as: 'task', attributes: ['task_id', 'title', 'description', 'priority'] },
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          attributes: ['profile_id', 'job_title'],
          include: [{ model: User, as: 'user', attributes: ['user_id', 'first_name', 'last_name', 'email'] }],
        },
        { model: User, as: 'assigner', attributes: ['user_id', 'first_name', 'last_name'] },
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
// FR-07, FR-08 | NFR-03
// =============================================================================
const getAssignmentsByEmployee = async (req, res) => {
  try {
    const { profileId } = req.params;

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
// HR Admin removes a task assignment.
// FR-07
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

    await assignment.destroy();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'TASK_DELETED',
      description: `Task assignment ${id} ("${assignment.task?.title}") deleted by HR.`,
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
