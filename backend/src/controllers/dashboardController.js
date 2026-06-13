// =============================================================================
// src/controllers/dashboardController.js
// HR dashboard summary statistics and onboarding progress endpoints.
// FR-08, FR-17 | Objective 1 & 4
// =============================================================================

const { Op } = require('sequelize')
const {
  EmployeeProfile,
  ProbationPeriod,
  OnboardingDocument,
  TaskAssignment,
  User,
  Department,
} = require('../models')

// =============================================================================
// GET /api/dashboard/stats
// HR summary stat cards — total employees, pending docs, active probations,
// overdue tasks.  FR-17 | HR_ADMIN only
// =============================================================================
const getDashboardStats = async (req, res) => {
  try {
    const today = new Date()

    const [totalEmployees, pendingDocuments, activeProbations, overdueTasks] =
      await Promise.all([
        EmployeeProfile.count(),
        OnboardingDocument.count({ where: { status: 'PENDING' } }),
        ProbationPeriod.count({ where: { status: 'ACTIVE' } }),
        TaskAssignment.count({
          where: {
            status: { [Op.ne]: 'COMPLETED' },
            due_date: { [Op.lt]: today },
          },
        }),
      ])

    return res.json({
      success: true,
      data: {
        totalEmployees,
        pendingDocuments,
        activeProbations,
        overdueTasks,
      },
    })
  } catch (error) {
    console.error('[dashboardController.getDashboardStats]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load dashboard statistics.' })
  }
}

// =============================================================================
// GET /api/dashboard/onboarding-progress
// Per-employee onboarding progress: task completion % + document counts.
// FR-08, FR-17 | HR_ADMIN only
// =============================================================================
const getOnboardingProgress = async (req, res) => {
  try {
    const profiles = await EmployeeProfile.findAll({
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['first_name', 'last_name', 'email', 'is_active'],
        },
        {
          model: Department,
          as: 'department',
          attributes: ['name'],
        },
        {
          model: TaskAssignment,
          as: 'taskAssignments',
          attributes: ['status', 'due_date'],
        },
        {
          model: OnboardingDocument,
          as: 'documents',
          attributes: ['status'],
        },
        {
          model: ProbationPeriod,
          as: 'probationPeriods',
          attributes: ['start_date', 'end_date', 'status'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
    })

    const today = new Date()

    const data = profiles.map((p) => {
      const tasks     = p.taskAssignments || []
      const docs      = p.documents       || []
      const probation = (p.probationPeriods  || [])[0] || null

      const totalTasks     = tasks.length
      const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length
      const overdueTasks   = tasks.filter(
        (t) => t.status !== 'COMPLETED' && new Date(t.due_date) < today
      ).length
      const taskProgress   = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

      const approvedDocs = docs.filter((d) => d.status === 'APPROVED').length
      const pendingDocs  = docs.filter((d) => d.status === 'PENDING').length
      const rejectedDocs = docs.filter((d) => d.status === 'REJECTED').length

      const probationDaysLeft = probation
        ? Math.floor((new Date(probation.end_date) - today) / 86400000)
        : null

      return {
        profile_id:      p.profile_id,
        first_name:      p.user?.first_name,
        last_name:       p.user?.last_name,
        is_active:       p.user?.is_active,
        job_title:       p.job_title,
        department:      p.department?.name,
        task_progress:   taskProgress,
        total_tasks:     totalTasks,
        completed_tasks: completedTasks,
        overdue_tasks:   overdueTasks,
        total_docs:      docs.length,
        approved_docs:   approvedDocs,
        pending_docs:    pendingDocs,
        rejected_docs:   rejectedDocs,
        probation_end:       probation?.end_date || null,
        probation_status:    probation?.status   || null,
        probation_days_left: probationDaysLeft,
      }
    })

    return res.json({ success: true, data })
  } catch (error) {
    console.error('[dashboardController.getOnboardingProgress]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load onboarding progress.' })
  }
}

// =============================================================================
// GET /api/dashboard/my-progress
// Employee's own onboarding summary for the Employee Dashboard.
// FR-08 | NEW_EMPLOYEE only
// =============================================================================
const getMyProgress = async (req, res) => {
  try {
    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
      include: [
        {
          model: TaskAssignment,
          as: 'taskAssignments',
          attributes: ['status', 'due_date'],
        },
        {
          model: OnboardingDocument,
          as: 'documents',
          attributes: ['status'],
        },
        {
          model: ProbationPeriod,
          as: 'probationPeriods',
          attributes: ['start_date', 'end_date', 'status'],
          required: false,
        },
      ],
    })

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' })
    }

    const today = new Date()
    const tasks = profile.taskAssignments || []
    const docs  = profile.documents       || []
    const prob  = (profile.probationPeriods  || [])[0] || null

    const totalTasks     = tasks.length
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length
    const taskProgress   = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const submittedDocs = docs.length
    const approvedDocs  = docs.filter((d) => d.status === 'APPROVED').length

    const probationDaysLeft = prob
      ? Math.floor((new Date(prob.end_date) - today) / 86400000)
      : null

    return res.json({
      success: true,
      data: {
        total_tasks:         totalTasks,
        completed_tasks:     completedTasks,
        task_progress:       taskProgress,
        submitted_docs:      submittedDocs,
        approved_docs:       approvedDocs,
        probation_days_left: probationDaysLeft,
        probation_status:    prob?.status || null,
      },
    })
  } catch (error) {
    console.error('[dashboardController.getMyProgress]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load progress.' })
  }
}

module.exports = { getDashboardStats, getOnboardingProgress, getMyProgress }
